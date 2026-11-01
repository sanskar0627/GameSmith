import { PassThrough, type Readable } from "node:stream";

import Docker from "dockerode";

import type { Config } from "./config.js";
import { LABEL, names } from "./ids.js";

export type ExecResult = { exitCode: number; stdout: Buffer; stderr: string };

export type StartSpec = {
  gameId: string;
  /** Private preview path the dev server serves under, e.g. /p/<id>-<secret>/. */
  base: string;
  /** Sanitized tar (paths relative to /workspace) to load before the first start. */
  restore?: Readable;
};

/**
 * Everything that touches Docker. The manager logic talks to this interface
 * so it can be tested with a fake.
 */
export interface Driver {
  start(spec: StartSpec): Promise<void>;
  /** Stops and removes the container and its network. The workspace volume stays. */
  stop(gameId: string): Promise<void>;
  running(): Promise<{ gameId: string; base: string }[]>;
  isRunning(gameId: string): Promise<boolean>;
  hasWorkspace(gameId: string): Promise<boolean>;
  removeWorkspace(gameId: string): Promise<void>;
  /** Runs a command inside the sandbox as its unprivileged user. */
  exec(gameId: string, cmd: string[], stdin?: Buffer, timeoutMs?: number): Promise<ExecResult>;
  /** Tar of /workspace (entries prefixed with `workspace/`, as Docker returns them). */
  exportWorkspace(gameId: string): Promise<Readable>;
  /** Where the preview proxy forwards to. */
  upstream(gameId: string): { host: string; port: number };
}

const SANDBOX_PORT = 5173;

function isStatus(error: unknown, code: number): boolean {
  return typeof error === "object" && error !== null && (error as { statusCode?: number }).statusCode === code;
}

export class DockerDriver implements Driver {
  constructor(
    private readonly config: Config,
    private readonly docker = new Docker({ socketPath: "/var/run/docker.sock" }),
  ) {}

  upstream(gameId: string) {
    return { host: names.container(gameId), port: SANDBOX_PORT };
  }

  /**
   * Each sandbox gets its own `internal` network: no route to the internet,
   * the host, Postgres or other sandboxes. Only the preview proxy joins it.
   */
  private async ensureNetwork(gameId: string) {
    const name = names.network(gameId);
    const network = this.docker.getNetwork(name);
    try {
      await network.inspect();
    } catch (error) {
      if (!isStatus(error, 404)) throw error;
      await this.docker.createNetwork({
        Name: name,
        Driver: "bridge",
        Internal: true,
        Labels: { [LABEL]: gameId },
      });
    }
    try {
      await network.connect({ Container: this.config.proxyContainer });
    } catch (error) {
      // 403: already connected.
      if (!isStatus(error, 403) && !isStatus(error, 409)) throw error;
    }
  }

  buildContainerOptions(spec: StartSpec): Docker.ContainerCreateOptions {
    const { gameId } = spec;
    const memory = this.config.memoryMb * 1024 * 1024;
    return {
      name: names.container(gameId),
      Image: this.config.image,
      User: "node",
      WorkingDir: "/workspace",
      Env: [
        `GS_BASE=${spec.base}`,
        `GS_HMR_CLIENT_PORT=${this.config.previewPublicPort}`,
        `GS_MAX_FILE_BYTES=${this.config.maxFileBytes}`,
      ],
      Labels: { [LABEL]: gameId },
      ExposedPorts: { [`${SANDBOX_PORT}/tcp`]: {} },
      StopTimeout: 5,
      HostConfig: {
        Runtime: this.config.runtime,
        Memory: memory,
        MemorySwap: memory,
        NanoCpus: Math.round(this.config.cpus * 1e9),
        PidsLimit: this.config.pids,
        CapDrop: ["ALL"],
        SecurityOpt: ["no-new-privileges:true"],
        ReadonlyRootfs: true,
        Tmpfs: { "/tmp": "rw,noexec,nosuid,size=64m" },
        Mounts: [{ Type: "volume", Source: names.volume(gameId), Target: "/workspace" }],
        NetworkMode: names.network(gameId),
        RestartPolicy: { Name: "no" },
        LogConfig: { Type: "json-file", Config: { "max-size": "1m", "max-file": "1" } },
      },
      NetworkingConfig: {
        EndpointsConfig: { [names.network(gameId)]: { Aliases: [names.container(gameId)] } },
      },
    };
  }

  async start(spec: StartSpec): Promise<void> {
    const { gameId } = spec;
    await this.ensureNetwork(gameId);
    await this.docker.createVolume({ Name: names.volume(gameId), Labels: { [LABEL]: gameId } });

    // A leftover container (crash, manager restart) is replaced: a new start
    // always gets a new preview secret.
    const old = this.docker.getContainer(names.container(gameId));
    try {
      await old.remove({ force: true });
    } catch (error) {
      if (!isStatus(error, 404)) throw error;
    }

    const container = await this.docker.createContainer(this.buildContainerOptions(spec));
    if (spec.restore) {
      // Docker extracts into the volume on the host side, before any game code runs.
      await container.putArchive(spec.restore, { path: "/workspace" });
    }
    await container.start();
  }

  async stop(gameId: string): Promise<void> {
    const container = this.docker.getContainer(names.container(gameId));
    try {
      await container.remove({ force: true });
    } catch (error) {
      if (!isStatus(error, 404)) throw error;
    }
    const network = this.docker.getNetwork(names.network(gameId));
    try {
      await network.disconnect({ Container: this.config.proxyContainer, Force: true });
    } catch {
      // Not connected.
    }
    try {
      await network.remove();
    } catch (error) {
      if (!isStatus(error, 404)) throw error;
    }
  }

  async running() {
    const list = await this.docker.listContainers({ filters: { label: [LABEL], status: ["running"] } });
    const out: { gameId: string; base: string }[] = [];
    for (const item of list) {
      const gameId = item.Labels[LABEL];
      if (!gameId) continue;
      const info = await this.docker.getContainer(item.Id).inspect();
      const base = info.Config.Env.find((e) => e.startsWith("GS_BASE="))?.slice("GS_BASE=".length);
      if (base) out.push({ gameId, base });
    }
    return out;
  }

  async isRunning(gameId: string) {
    try {
      const info = await this.docker.getContainer(names.container(gameId)).inspect();
      return info.State.Running;
    } catch (error) {
      if (isStatus(error, 404)) return false;
      throw error;
    }
  }

  async hasWorkspace(gameId: string) {
    try {
      await this.docker.getVolume(names.volume(gameId)).inspect();
      return true;
    } catch (error) {
      if (isStatus(error, 404)) return false;
      throw error;
    }
  }

  async removeWorkspace(gameId: string) {
    try {
      await this.docker.getVolume(names.volume(gameId)).remove();
    } catch (error) {
      if (!isStatus(error, 404)) throw error;
    }
  }

  async exec(gameId: string, cmd: string[], stdin?: Buffer, timeoutMs = 20_000): Promise<ExecResult> {
    const container = this.docker.getContainer(names.container(gameId));
    const exec = await container.exec({
      Cmd: cmd,
      User: "node",
      WorkingDir: "/workspace",
      AttachStdout: true,
      AttachStderr: true,
      AttachStdin: Boolean(stdin),
    });
    const stream = await exec.start({ hijack: true, stdin: Boolean(stdin) });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    stdout.on("data", (c: Buffer) => out.push(c));
    stderr.on("data", (c: Buffer) => err.push(c));
    this.docker.modem.demuxStream(stream, stdout, stderr);

    const finished = new Promise<void>((resolve, reject) => {
      stream.on("end", resolve);
      stream.on("close", resolve);
      stream.on("error", reject);
    });
    if (stdin) {
      stream.write(stdin);
      stream.end();
    }
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        (stream as unknown as { destroy?: () => void }).destroy?.();
        reject(new Error("exec timed out"));
      }, timeoutMs);
    });
    try {
      await Promise.race([finished, timeout]);
    } finally {
      clearTimeout(timer);
    }
    const info = await exec.inspect();
    return { exitCode: info.ExitCode ?? 1, stdout: Buffer.concat(out), stderr: Buffer.concat(err).toString("utf8") };
  }

  async exportWorkspace(gameId: string): Promise<Readable> {
    const stream = await this.docker.getContainer(names.container(gameId)).getArchive({ path: "/workspace" });
    return stream as unknown as Readable;
  }
}
