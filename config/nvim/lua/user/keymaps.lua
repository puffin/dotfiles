--[[
  Key Mappings
  ============
  General-purpose keymaps. Plugin-specific keymaps live in plugins.lua.
]]

-- Leader key (must be set before any <leader> mappings)
vim.g.mapleader = " "

local map = vim.keymap.set

-------------------------------------------------------------------------------
-- Visual Mode
-------------------------------------------------------------------------------

-- Keep selection after indent
map("v", "<", "<gv")
map("v", ">", ">gv")

-- Paste without overwriting register
map("x", "p", "pgvy`]")

-------------------------------------------------------------------------------
-- Terminal Mode
-------------------------------------------------------------------------------

-- Use <C-w> to navigate windows from terminal mode (e.g. Claude Code panel)
map("t", "<C-w>", "<C-\\><C-n><C-w>", { desc = "Window navigation from terminal" })
