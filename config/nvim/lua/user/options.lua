local opt = vim.opt
local g = vim.g

-- Python host
g.python_host_prog = "/usr/bin/python"

-- General
opt.history = 1000
opt.backupdir = { "~/.vim-tmp", "~/.tmp", "~/tmp", "/var/tmp", "/tmp" }
opt.directory = { "~/.vim-tmp", "~/.tmp", "~/tmp", "/var/tmp", "/tmp" }
opt.inccommand = "nosplit"
opt.backspace = { "indent", "eol", "start" }
opt.clipboard = "unnamedplus"
opt.mouse = ""

-- Searching
opt.ignorecase = true
opt.smartcase = true
opt.hlsearch = true
opt.incsearch = true
opt.lazyredraw = false
opt.magic = true

-- Error bells
opt.errorbells = false
opt.visualbell = true
opt.timeoutlen = 500

-- Appearance
opt.number = true
opt.wrap = true
opt.linebreak = true
opt.wrapmargin = 0
opt.textwidth = 0
opt.showbreak = "↪"
opt.autoindent = true
opt.ttyfast = true
opt.diffopt:append({ "vertical", "iwhite", "internal", "algorithm:patience", "hiddenoff" })
opt.laststatus = 2
opt.scrolloff = 7
opt.wildmenu = true
opt.hidden = true
opt.showcmd = true
opt.showmode = false
opt.wildmode = "list:longest"
opt.shell = vim.env.SHELL
opt.cmdheight = 1
opt.title = true
opt.showmatch = true
opt.matchtime = 2
opt.updatetime = 300
opt.signcolumn = "yes"
opt.shortmess:append("c")
opt.cursorline = true

-- Tab control
opt.expandtab = true
opt.smarttab = true
opt.tabstop = 2
opt.softtabstop = 2
opt.shiftwidth = 2
opt.shiftround = true

-- Code folding
opt.foldmethod = "syntax"
opt.foldlevelstart = 99
opt.foldnestmax = 10
opt.foldenable = false
opt.foldlevel = 1

-- Invisible characters
opt.list = true
opt.listchars = {
    tab = "→ ",
    eol = "¬",
    trail = "⋅",
    extends = "❯",
    precedes = "❮",
}

-- Colors
opt.termguicolors = true
opt.guicursor = "n-v-c:block,i-ci-ve:ver25,r-cr:hor20,o:hor50"
    .. ",a:blinkwait700-blinkoff400-blinkon250-Cursor/lCursor"
    .. ",sm:block-blinkwait175-blinkoff150-blinkon175"

-- Highlight conflicts
vim.cmd([[match ErrorMsg '^\(<\|=\|>\)\{7\}\([^=].\+\)\?$']])

-- Highlight trailing whitespace
vim.cmd([[highlight ExtraWhitespace ctermbg=darkgreen guibg=darkgreen]])
vim.cmd([[match ExtraWhitespace /\s\+$\|\t/]])
