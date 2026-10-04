

Pattern edits: JSON rectangle {row,col,width,height,cells,mode}, mode replace or xor, dimensions at most the grid dimensions, binary row-major cells, toroidal origin. An edit targets the currently committed generation and discards its in-flight successor. It becomes visible as a complete edit after worker acknowledgement, preserving generation and advancing editRevision. Undo restores the committed snapshot before that edit; redo restores its edited snapshot. A new edit after undo discards redo history; ordinary reset clears edit history. Edits while an edit/reset is pending are refused.
