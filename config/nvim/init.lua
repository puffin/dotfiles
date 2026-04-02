-- Neovim configuration entry point
-- Lua modules for settings, keymaps, and autocommands
require("user.options")
require("user.keymaps")
require("user.autocmds")

-- Source plugin declarations and configs (still vimscript for now)
local config_dir = vim.fn.stdpath("config")
vim.cmd("source " .. config_dir .. "/plugin-config.vim")
