-- Leader key
vim.g.mapleader = " "

local map = vim.keymap.set

-- Better tabbing (keep selection)
map("v", "<", "<gv")
map("v", ">", ">gv")

-- Better yank/paste that keeps register
map("x", "p", "pgvy`]")
