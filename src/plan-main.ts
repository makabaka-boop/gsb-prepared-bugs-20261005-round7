import { PlanRunner } from "./store/plan-runner";
import { MockAdapter, MOCK_DEVICE_A } from "./ble/mock-adapter";
import { RealBleAdapter } from "./ble/real-adapter";
const mock = new MockAdapter(MOCK_DEVICE_A, {
  writeDelayMs: 30,
  execDelayMs: 100,
  notifyDelayMs: 150,
  dropDelayMs: null,
  behavior: "apply",
  forgetReceipt: false,
  rebootBeforeReconnect: false,
  staleLateNotifyOnReconnect: false,
});
let runner = new PlanRunner(mock);
const el = (id: string) => document.getElementById(id)!;
el("connect").onclick = async () => {
  try {
    if (
      runner.phase === "idle" &&
      !runner.adapter.connected &&
      (el("mode") as HTMLSelectElement).value === "real"
    )
      runner = new PlanRunner(new RealBleAdapter());
    await runner.connect();
  } catch (e) {
    alert(String(e));
  }
};
el("begin").onclick = () => {
  try {
    runner.begin(JSON.parse((el("steps") as HTMLTextAreaElement).value));
  } catch (e) {
    alert(String(e));
  }
};
el("cancel").onclick = () => runner.cancel();
el("continue").onclick = () => {
  try {
    runner.continuePlan();
  } catch (e) {
    alert(String(e));
  }
};
el("drop").onclick = () => mock.forceDropNow();
setInterval(
  () =>
    (el("state").textContent = JSON.stringify(
      {
        phase: runner.phase,
        confirmed: runner.info,
        pending: runner.pending,
        outcomes: runner.outcomes,
      },
      null,
      2,
    )),
  100,
);
