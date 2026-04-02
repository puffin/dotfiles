--[[
  Neovim Configuration
  ====================
  Entry point for all configuration modules.

  Structure:
    lua/user/options.lua    - Editor settings (tabs, search, appearance)
    lua/user/keymaps.lua    - General key mappings
    lua/user/autocmds.lua   - Autocommands
    lua/user/plugins.lua    - Plugin declarations (lazy.nvim)
    lua/user/lsp.lua        - Language servers (mason + native LSP)
]]

-- Core
require("user.options")
require("user.keymaps")
require("user.autocmds")

-- Plugins
require("user.plugins")

-- LSP
require("user.lsp")
