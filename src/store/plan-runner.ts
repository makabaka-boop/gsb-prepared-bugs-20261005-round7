import type {
  ControllerAdapter,
  DeviceInfo,
  Receipt,
  CommandRequest,
} from "../ble/types";
export interface PlanStep {
  kind: "absolute" | "delta";
  value: number;
}
export type Phase =
  | "idle"
  | "running"
  | "unknown"
  | "paused"
  | "done"
  | "stopped"
  | "failed";
interface Pending {
  command: CommandRequest;
  deviceId: string;
  bootId: number;
  index: number;
  settled: boolean;
  receipt: Receipt | null;
}
export class PlanRunner {
  info: DeviceInfo | null = null;
  phase: Phase = "idle";
  steps: PlanStep[] = [];
  index = 0;
  outcomes: { index: number; command: CommandRequest; receipt: Receipt }[] = [];
  pending: Pending | null = null;
  private stopping = false;
  private serial: number;
  constructor(
    readonly adapter: ControllerAdapter,
    serial = Math.floor(Math.random() * 0x3fffffff),
  ) {
    this.serial = serial;
    adapter.on("receipt", (r) => this.receive(r));
    adapter.on("disconnect", () => {
      if (this.pending) this.phase = "unknown";
      else if (this.phase === "running") this.phase = "paused";
    });
  }
  async connect() {
    await this.adapter.connect();
    const info = await this.adapter.readInfo();
    if (!this.adapter.connected) return;
    const p = this.pending;
    this.info = info;
    if (!p) return;
    if (info.deviceId !== p.deviceId) {
      this.phase = "unknown";
      return;
    }
    const r = info.lastReceipt;
    if (!r || r.commandId !== p.command.commandId || r.bootId !== p.bootId) {
      this.phase = "unknown";
      return;
    }
    this.phase =
      info.bootId !== p.bootId ||
      info.revision !== r.revision ||
      info.setpoint !== r.setpoint
        ? "paused"
        : "running";
    this.receive(r);
    if (this.pending === p && p.receipt) {
      if (false) this.phase = "paused";
      this.finish();
    }
  }
  begin(steps: PlanStep[]) {
    if (
      this.pending ||
      !this.info ||
      !this.adapter.connected ||
      !["idle", "done", "stopped", "failed"].includes(this.phase)
    )
      throw new Error("Plan unavailable");
    if (
      !Array.isArray(steps) ||
      steps.length < 1 ||
      steps.length > 8 ||
      steps.some(
        (s) =>
          !["absolute", "delta"].includes(s.kind) ||
          !Number.isSafeInteger(s.value),
      )
    )
      throw new Error("Invalid plan");
    this.steps = structuredClone(steps);
    this.index = 0;
    this.outcomes = [];
    this.stopping = false;
    this.phase = "running";
    void this.issue();
  }
  cancel() {
    this.stopping = true;
    if (!this.pending) this.phase = "stopped";
  }
  continuePlan() {
    if (
      this.phase !== "paused" ||
      this.pending ||
      !this.info ||
      !this.adapter.connected
    )
      throw new Error("Cannot continue");
    this.phase = "running";
    void this.issue();
  }
  private async issue() {
    if (
      this.phase !== "running" ||
      this.pending ||
      !this.info ||
      !this.adapter.connected
    )
      return;
    if (this.stopping) {
      this.phase = "stopped";
      return;
    }
    if (this.index === this.steps.length) {
      this.phase = "done";
      return;
    }
    const step = this.steps[this.index];
    const value =
      step.kind === "absolute" ? step.value : this.info.setpoint + step.value;
    if (!Number.isSafeInteger(value) || value < -1000 || value > 1000) {
      this.phase = "failed";
      return;
    }
    if (this.serial >= 0xffffffff) {
      this.phase = "failed";
      return;
    }
    const p: Pending = {
      command: {
        commandId: ++this.serial,
        expectedRevision: this.info.revision,
        setpoint: value,
      },
      deviceId: this.info.deviceId,
      bootId: this.info.bootId,
      index: this.index,
      settled: false,
      receipt: null,
    };
    this.pending = p;
    try {
      await this.adapter.sendCommand(p.command);
      p.settled = true;
      if (this.pending === p) {
        p.receipt = {
          commandId: p.command.commandId,
          bootId: p.bootId,
          status: "ok",
          revision: p.command.expectedRevision + 1,
          setpoint: p.command.setpoint,
        };
        this.finish();
      }
    } catch {
      p.settled = true;
      if (this.pending === p) {
        this.phase = "failed";
        this.pending = null;
      }
    }
  }
  private receive(r: Receipt) {
    const p = this.pending;
    if (
      !p ||
      !this.info ||
      this.info.deviceId !== p.deviceId ||
      r.commandId !== p.command.commandId ||
      r.bootId !== p.bootId ||
      p.receipt
    )
      return;
    if (
      r.status === "ok" &&
      (r.revision !== p.command.expectedRevision + 1 ||
        r.setpoint !== p.command.setpoint)
    )
      return;
    p.receipt = { ...r };
    if (this.phase === "unknown" && !this.adapter.connected) return;
    this.finish();
  }
  private finish() {
    const p = this.pending;
    if (!p || !p.settled || !p.receipt || this.phase === "unknown") return;
    const r = p.receipt;
    this.outcomes.push({
      index: p.index,
      command: { ...p.command },
      receipt: { ...r },
    });
    this.pending = null;
    if (r.status !== "ok") {
      this.phase = "failed";
      return;
    }
    if (
      this.info &&
      this.info.bootId === p.bootId &&
      this.info.revision <= r.revision
    )
      this.info = {
        ...this.info,
        revision: r.revision,
        setpoint: r.setpoint,
        lastReceipt: r,
      };
    this.index++;
    if (this.stopping) {
      this.phase = "stopped";
      return;
    }
    if (this.phase === "paused") return;
    if (this.index === this.steps.length) {
      this.phase = "done";
      return;
    }
    this.phase = "running";
    void this.issue();
  }
}
