use crate::{decode, Instr, Machine, StepRecord, RAM_SIZE, RX_ADDR, TX_ADDR};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Read,
    Write,
}
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Access {
    pub address: u32,
    pub size: u32,
    pub kind: Kind,
}
#[derive(Clone, Debug)]
pub struct Watch {
    pub start: u32,
    pub end: u64,
    pub kind: Kind,
}
impl Watch {
    pub fn new(start: u32, length: u32, kind: Kind) -> Result<Self, String> {
        let end = start as u64 + length as u64;
        if length == 0 || end > 1u64 << 32 {
            return Err("Invalid watch range".into());
        }
        Ok(Self { start, end, kind })
    }
    fn hits(&self, a: Access) -> bool {
        self.kind == a.kind
            && (a.address as u64) < self.end
            && (a.address as u64 + a.size as u64) > self.start as u64
    }
}
#[derive(Debug)]
pub enum Action {
    Stopped(Access),
    Executed(StepRecord),
    Invalidated,
}

fn access(m: &Machine) -> Option<Access> {
    let instruction = m.fetch(m.pc).ok().and_then(decode)?;
    let (base, imm, size, kind) = match instruction {
        Instr::Ld { f3, rs1, imm, .. } => (
            rs1,
            imm,
            match f3 {
                0 | 4 => 1,
                1 | 5 => 2,
                _ => 4,
            },
            Kind::Read,
        ),
        Instr::St { f3, rs1, imm, .. } => (
            rs1,
            imm,
            match f3 {
                0 => 1,
                1 => 2,
                _ => 4,
            },
            Kind::Write,
        ),
        _ => return None,
    };
    let address = m.regs[base as usize].wrapping_add(imm as u32);
    let mapped = address as u64 + size as u64 <= RAM_SIZE as u64
        || (kind == Kind::Read && address == RX_ADDR)
        || (kind == Kind::Write && address == TX_ADDR);
    if address % size != 0 || !mapped {
        return None;
    }
    Some(Access {
        address,
        size,
        kind,
    })
}

pub struct Debugger {
    pub machine: Machine,
    watches: Vec<Watch>,
    pending: Option<(Machine, Access)>,
}
impl Debugger {
    pub fn new(machine: Machine, watches: Vec<Watch>) -> Self {
        Self {
            machine,
            watches,
            pending: None,
        }
    }
    pub fn step(&mut self) -> Action {
        if let Some((before, a)) = &self.pending {
            if before == &self.machine {
                return Action::Stopped(*a);
            }
            self.pending = None;
            return Action::Invalidated;
        }
        let before = self.machine.clone();
        let record = self.machine.step();
        if let Some(a) = access(&before) {
            if self.watches.iter().any(|w| w.hits(a)) {
                self.machine.pc = before.pc;
                self.machine.regs = before.regs;
                self.pending = Some((self.machine.clone(), a));
                return Action::Stopped(a);
            }
        }
        Action::Executed(record)
    }
    pub fn resume(&mut self) -> Action {
        match self.pending.take() {
            Some((before, _)) if before == self.machine => Action::Executed(self.machine.step()),
            Some(_) => Action::Invalidated,
            None => self.step(),
        }
    }
    pub fn cancel(&mut self) {
        self.pending = None;
    }
    pub fn set_watches(&mut self, watches: Vec<Watch>) {
        self.pending = None;
        self.watches = watches;
    }
}
