use rv32i_core::watch::{Debugger, Kind, Watch};
use rv32i_core::{Machine, RX_ADDR};
fn main() {
    let mut m = Machine::new();
    m.regs[1] = RX_ADDR;
    m.push_rx(42);
    let load: u32 = (1 << 15) | 0x03;
    m.load_bytes(0, &load.to_le_bytes());
    let mut d = Debugger::new(m, vec![Watch::new(RX_ADDR, 1, Kind::Read).unwrap()]);
    println!("{:?}", d.step());
    println!("rx before resume: {:?}", d.machine.rx);
    println!("{:?}", d.resume());
    println!("rx after resume: {:?}", d.machine.rx);
}
