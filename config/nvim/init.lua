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
    lua/user/completion.lua - Autocompletion (nvim-cmp + LuaSnip)
    lua/user/format.lua     - Code formatting (conform.nvim / prettier)
]]

-- Core
require("user.options")
require("user.keymaps")
require("user.autocmds")

-- Plugins
require("user.plugins")

-- LSP, completion, and formatting
require("user.lsp")
require("user.completion")
require("user.format")
