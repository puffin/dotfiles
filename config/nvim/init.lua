-- Neovim configuration entry point
-- Lua modules for settings, keymaps, and autocommands
require("user.options")
require("user.keymaps")
require("user.autocmds")

-- Plugin management (lazy.nvim)
require("user.plugins")
