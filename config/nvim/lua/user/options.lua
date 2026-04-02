--[[
  Editor Options
  ==============
  General settings, appearance, search behavior, tabs, folding, and colors.
]]

local opt = vim.opt

-------------------------------------------------------------------------------
-- General
-------------------------------------------------------------------------------
vim.g.python_host_prog = "/usr/bin/python"

opt.history     = 1000
opt.backupdir   = { "~/.vim-tmp", "~/.tmp", "~/tmp", "/var/tmp", "/tmp" }
opt.directory   = { "~/.vim-tmp", "~/.tmp", "~/tmp", "/var/tmp", "/tmp" }
opt.inccommand  = "nosplit"          -- Live preview of :substitute
opt.backspace   = { "indent", "eol", "start" }
opt.clipboard   = "unnamedplus"      -- Use system clipboard
opt.mouse       = ""                 -- Disable mouse

-------------------------------------------------------------------------------
-- Search
-------------------------------------------------------------------------------
opt.ignorecase = true                -- Case-insensitive search...
opt.smartcase  = true                -- ...unless the query has uppercase
opt.hlsearch   = true                -- Highlight matches
opt.incsearch  = true                -- Incremental search
opt.lazyredraw = false
opt.magic      = true                -- Enable regex special chars

-------------------------------------------------------------------------------
-- UI / Appearance
-------------------------------------------------------------------------------
opt.number      = true               -- Show line numbers
opt.wrap        = true               -- Wrap long lines
opt.linebreak   = true               -- Wrap at word boundaries
opt.wrapmargin  = 0
opt.textwidth   = 0                  -- No hard line breaks
opt.showbreak   = "↪"                -- Indicator for wrapped lines
opt.autoindent  = true
opt.ttyfast     = true
opt.laststatus  = 2                  -- Always show statusline
opt.scrolloff   = 7                  -- Keep 7 lines visible around cursor
opt.wildmenu    = true               -- Enhanced command-line completion
opt.hidden      = true               -- Allow unsaved background buffers
opt.showcmd     = true               -- Show partial commands
opt.showmode    = false              -- Hidden (shown by statusline plugin)
opt.wildmode    = "list:longest"
opt.shell       = vim.env.SHELL
opt.cmdheight   = 1
opt.title       = true               -- Set terminal title
opt.showmatch   = true               -- Highlight matching brackets
opt.matchtime   = 2                  -- Tenths of a second to show match
opt.updatetime  = 300                -- Faster CursorHold events
opt.signcolumn  = "yes"              -- Always show sign column
opt.cursorline  = true               -- Highlight current line

opt.shortmess:append("c")           -- Don't show completion messages
opt.diffopt:append({ "vertical", "iwhite", "internal", "algorithm:patience", "hiddenoff" })

-- Disable error bells
opt.errorbells = false
opt.visualbell = true
opt.timeoutlen = 500

-------------------------------------------------------------------------------
-- Tabs & Indentation
-------------------------------------------------------------------------------
opt.expandtab   = true               -- Spaces instead of tabs
opt.smarttab    = true
opt.tabstop     = 2
opt.softtabstop = 2
opt.shiftwidth  = 2
opt.shiftround  = true               -- Round indent to multiple of shiftwidth

-------------------------------------------------------------------------------
-- Code Folding
-------------------------------------------------------------------------------
opt.foldmethod     = "syntax"
opt.foldlevelstart = 99              -- Start with all folds open
opt.foldnestmax    = 10
opt.foldenable     = false            -- Don't fold by default
opt.foldlevel      = 1

-------------------------------------------------------------------------------
-- Whitespace Characters
-------------------------------------------------------------------------------
opt.list = true
opt.listchars = {
    tab      = "→ ",
    eol      = "¬",
    trail    = "⋅",
    extends  = "❯",
    precedes = "❮",
}

-------------------------------------------------------------------------------
-- Colors & Cursor
-------------------------------------------------------------------------------
opt.termguicolors = true
opt.guicursor = table.concat({
    "n-v-c:block",
    "i-ci-ve:ver25",
    "r-cr:hor20",
    "o:hor50",
    "a:blinkwait700-blinkoff400-blinkon250-Cursor/lCursor",
    "sm:block-blinkwait175-blinkoff150-blinkon175",
}, ",")

-------------------------------------------------------------------------------
-- Highlights
-------------------------------------------------------------------------------

-- Mark git conflict markers as errors
vim.cmd([[match ErrorMsg '^\(<\|=\|>\)\{7\}\([^=].\+\)\?$']])

-- Highlight trailing whitespace
vim.api.nvim_set_hl(0, "ExtraWhitespace", { bg = "darkgreen", ctermbg = "darkgreen" })
vim.cmd([[match ExtraWhitespace /\s\+$\|\t/]])
