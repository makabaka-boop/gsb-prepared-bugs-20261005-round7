

The watch debugger is exposed by rv32i_core::watch and cargo run --bin watch_demo. A watch covers a half-open byte range and a read/write kind. Stop before a valid overlapping memory operation, including MMIO and x0 loads. Existing architectural faults take precedence. Pause does not consume execution budget; repeated inspection is inert. Resume executes that pending instruction once. An intervening machine edit invalidates the pending operation rather than applying it to edited state.
