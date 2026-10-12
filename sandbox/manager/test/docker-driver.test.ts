import { Readable } from "node:stream";

import type Docker from "dockerode";
import { describe, expect, it } from "vitest";

import { loadConfig } from "../src/config.js";
import { DockerDriver } from "../src/driver.js";

const GAME = "11111111-1111-4111-8111-111111111111";

function fakeDocker() {
  const calls: string[] = [];
  const created: Record<string, unknown> = {};
  const notFound = Object.assign(new Error("not found"), { statusCode: 404 });
  const docker = {
    getNetwork: (name: string) => ({
      inspect: async () => {
        calls.push(`network.inspect ${name}`);
        throw notFound;
      },
      connect: async (opts: unknown) => void calls.push(`network.connect ${name} ${JSON.stringify(opts)}`),
      disconnect: async () => void calls.push(`network.disconnect ${name}`),
      remove: async () => void calls.push(`network.remove ${name}`),
    }),
    createNetwork: async (opts: Record<string, unknown>) => {
      calls.push(`createNetwork ${opts.Name}`);
      created.network = opts;
    },
    createVolume: async (opts: Record<string, unknown>) => void calls.push(`createVolume ${opts.Name}`),
    getContainer: (name: string) => ({
      remove: async () => {
        calls.push(`container.remove ${name}`);
        throw notFound;
      },
    }),
    createContainer: async (opts: Record<string, unknown>) => {
      calls.push(`createContainer ${opts.name}`);
      created.container = opts;
      return {
        putArchive: async () => void calls.push("putArchive"),
        start: async () => void calls.push("start"),
      };
    },
  };
  return { docker: docker as unknown as Docker, calls, created };
}

describe("DockerDriver", () => {
  const config = loadConfig({
    SANDBOX_MANAGER_TOKEN: "x".repeat(32),
    SANDBOX_RUNTIME: "runsc",
    PROXY_CONTAINER: "gamesmith-sandbox-proxy",
  });

  it("creates a locked-down container on its own internal network", async () => {
    const { docker, calls, created } = fakeDocker();
    const driver = new DockerDriver(config, docker);
    await driver.start({ gameId: GAME, base: `/p/${GAME}-secret/`, restore: Readable.from([Buffer.from("tar")]) });

    expect(calls).toEqual([
      `network.inspect gs-net-${GAME}`,
      `createNetwork gs-net-${GAME}`,
      `network.connect gs-net-${GAME} {"Container":"gamesmith-sandbox-proxy"}`,
      `createVolume gs-ws-${GAME}`,
      `container.remove gs-sbx-${GAME}`,
      `createContainer gs-sbx-${GAME}`,
      "putArchive",
      "start",
    ]);
    expect(created.network).toMatchObject({ Internal: true, Driver: "bridge" });
    const opts = created.container as Docker.ContainerCreateOptions;
    expect(opts.User).toBe("node");
    expect(opts.Env).toContain(`GS_BASE=/p/${GAME}-secret/`);
    expect(opts.HostConfig).toMatchObject({
      Runtime: "runsc",
      CapDrop: ["ALL"],
      SecurityOpt: ["no-new-privileges:true"],
      ReadonlyRootfs: true,
      NetworkMode: `gs-net-${GAME}`,
      Memory: 1024 * 1024 * 1024,
      MemorySwap: 1024 * 1024 * 1024,
      PidsLimit: 256,
      NanoCpus: 1e9,
    });
    expect(opts.HostConfig?.Mounts).toEqual([{ Type: "volume", Source: `gs-ws-${GAME}`, Target: "/workspace" }]);
    // No published ports, no privileged mode, no host network.
    expect(opts.HostConfig?.PortBindings).toBeUndefined();
    expect(opts.HostConfig?.Privileged).toBeUndefined();
  });

  it("refuses to run production sandboxes without gVisor", () => {
    expect(() =>
      loadConfig({ SANDBOX_MANAGER_TOKEN: "x".repeat(32), SANDBOX_RUNTIME: "runc", SANDBOX_REQUIRE_GVISOR: "true" }),
    ).toThrow(/gVisor/);
    expect(() => loadConfig({ SANDBOX_MANAGER_TOKEN: "short" })).toThrow(/32/);
  });
});
