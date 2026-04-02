--[[
  Plugins
  =======
  All plugin declarations managed by lazy.nvim.
  Plugin-specific keymaps and config live alongside each plugin.
]]

-------------------------------------------------------------------------------
-- Bootstrap lazy.nvim (auto-install on first launch)
-------------------------------------------------------------------------------
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
    vim.fn.system({
        "git", "clone", "--filter=blob:none",
        "https://github.com/folke/lazy.nvim.git",
        "--branch=stable", lazypath,
    })
end
vim.opt.rtp:prepend(lazypath)

-------------------------------------------------------------------------------
-- Plugin specs
-------------------------------------------------------------------------------
require("lazy").setup({

    ---------------------------------------------------------------------------
    -- Colorscheme
    ---------------------------------------------------------------------------
    {
        "rakr/vim-one",
        lazy = false,
        priority = 1000,
        config = function()
            -- Use base16 if available, otherwise default to One Light
            if vim.fn.filereadable(vim.fn.expand("~/.vimrc_background")) == 1 then
                vim.g.base16colorspace = 256
                vim.cmd("source ~/.vimrc_background")
            else
                vim.opt.background = "light"
                vim.cmd.colorscheme("one")
            end

            vim.cmd("syntax on")
            vim.cmd("filetype plugin indent on")

            -- Italic comments and HTML attributes
            vim.api.nvim_set_hl(0, "Comment",    { italic = true })
            vim.api.nvim_set_hl(0, "htmlArg",    { italic = true })
            vim.api.nvim_set_hl(0, "xmlAttrib",  { italic = true })

            -- Diagnostic float colors
            vim.api.nvim_set_hl(0, "DiagnosticInfo", { fg = "Blue" })
            vim.api.nvim_set_hl(0, "DiagnosticHint", { fg = "Grey" })
        end,
    },

    ---------------------------------------------------------------------------
    -- UI
    ---------------------------------------------------------------------------

    -- Smooth scrolling
    { "psliwka/vim-smoothie", event = "VeryLazy" },

    -- Statusline
    {
        "nvim-lualine/lualine.nvim",
        lazy = false,
        dependencies = { "kyazdani42/nvim-web-devicons" },
        config = function()
            -- Git blame for the statusline (truncated, hidden on narrow windows)
            local function git_blame()
                if vim.fn.winwidth(0) <= 100 then return "" end
                local blame = vim.b.gitsigns_blame_line or ""
                return blame:gsub("[()]", ""):sub(1, 50)
            end

            require("lualine").setup({
                options = {
                    theme = "auto",
                    section_separators    = { left = "", right = "" },
                    component_separators  = { left = "", right = "" },
                },
                sections = {
                    lualine_a = { "mode" },
                    lualine_b = { "branch" },
                    lualine_c = {
                        { "filetype", icon_only = true, separator = "", padding = { left = 1, right = 0 } },
                        { "filename", path = 1 },     -- Relative path
                    },
                    lualine_x = { { git_blame }, "diagnostics" },
                    lualine_y = { "encoding", "fileformat" },
                    lualine_z = { "progress", "location" },
                },
                tabline = {},
            })
        end,
    },

    -- Icons (used by lualine, nvim-tree, etc.)
    { "kyazdani42/nvim-web-devicons", lazy = false },

    ---------------------------------------------------------------------------
    -- Editor Enhancements
    ---------------------------------------------------------------------------

    -- Text manipulation
    { "tpope/vim-abolish",    event = "VeryLazy" },  -- Smart substitution (:S)
    { "tpope/vim-surround",   event = "VeryLazy" },  -- Change/add/delete surroundings
    { "tpope/vim-repeat",     event = "VeryLazy" },  -- Repeat plugin actions with .
    { "tpope/vim-unimpaired", event = "VeryLazy" },  -- Handy bracket mappings
    { "tpope/vim-ragtag",     event = "VeryLazy" },  -- HTML/XML tag helpers
    { "tpope/vim-sleuth",     event = "VeryLazy" },  -- Auto-detect indent style
    { "sickill/vim-pasta",    event = "VeryLazy" },  -- Context-aware pasting

    -- Treesitter-aware commenting (gc / gcc)
    {
        "numToStr/Comment.nvim",
        event = "VeryLazy",
        config = function() require("Comment").setup() end,
    },

    -- Split/join code (gS / gJ)
    { "AndrewRadev/splitjoin.vim", event = "VeryLazy" },

    -- Ripgrep search (provides :Ack)
    { "wincent/ferret", event = "VeryLazy" },

    -- EditorConfig support
    { "editorconfig/editorconfig-vim", event = "VeryLazy" },

    -- Close buffer without closing split
    {
        "moll/vim-bbye",
        cmd = "Bdelete",
        keys = { { "<leader>b", ":Bdelete<cr>", desc = "Delete buffer" } },
    },

    -- Tmux integration
    { "benmills/vimux", cmd = { "VimuxRunCommand", "VimuxPromptCommand", "VimuxRunLastCommand" } },

    ---------------------------------------------------------------------------
    -- Session Management
    ---------------------------------------------------------------------------

    { "tpope/vim-obsession",    lazy = false },
    {
        "dhruvasagar/vim-prosession",
        lazy = false,
        dependencies = { "tpope/vim-obsession" },
    },

    ---------------------------------------------------------------------------
    -- Start Screen
    ---------------------------------------------------------------------------
    {
        "mhinz/vim-startify",
        lazy = false,
        init = function()
            vim.g.startify_files_number    = 5
            vim.g.startify_change_to_dir   = 0
            vim.g.startify_custom_header   = {}
            vim.g.startify_relative_path   = 1
            vim.g.startify_use_env         = 1

            vim.g.startify_commands = {
                { up = { "Update Plugins", ":Lazy update" } },
            }
            vim.g.startify_bookmarks = {
                { c = "~/.dotfiles/config/nvim/init.lua" },
                { g = "~/.gitconfig" },
                { z = "~/.dotfiles/zsh/zshrc.symlink" },
            }
        end,
        config = function()
            -- Recent commits list (requires vimscript for function() refs)
            vim.cmd([[
                function! s:list_commits()
                    let git = 'git -C ' . getcwd()
                    let commits = systemlist(git . ' log --oneline | head -n5')
                    let git = 'G' . git[1:]
                    return map(commits, '{"line": matchstr(v:val, "\\s\\zs.*"), "cmd": "'. git .' show ". matchstr(v:val, "^\\x\\+") }')
                endfunction

                let g:startify_lists = [
                \  { 'type': 'dir',       'header': [ 'Files '. getcwd() ] },
                \  { 'type': function('s:list_commits'), 'header': [ 'Recent Commits' ] },
                \  { 'type': 'sessions',  'header': [ 'Sessions' ]       },
                \  { 'type': 'bookmarks', 'header': [ 'Bookmarks' ]      },
                \  { 'type': 'commands',  'header': [ 'Commands' ]       },
                \ ]

                autocmd User Startified setlocal cursorline
            ]])
            vim.keymap.set("n", "<leader>st", ":Startify<cr>")
        end,
    },

    ---------------------------------------------------------------------------
    -- Git
    ---------------------------------------------------------------------------

    -- Git signs in gutter + hunk navigation
    {
        "lewis6991/gitsigns.nvim",
        event = "VeryLazy",
        config = function()
            require("gitsigns").setup({
                signs = {
                    add          = { text = "┃" },
                    change       = { text = "┃" },
                    delete       = { text = "-" },
                    topdelete    = { text = "_" },
                    changedelete = { text = "┃" },
                },
                current_line_blame = false,
                on_attach = function(bufnr)
                    local gs = package.loaded.gitsigns
                    local function map(mode, l, r, desc)
                        vim.keymap.set(mode, l, r, { buffer = bufnr, silent = true, desc = desc })
                    end
                    map("n", "]g", gs.next_hunk,    "Next hunk")
                    map("n", "[g", gs.prev_hunk,    "Previous hunk")
                    map("n", "gs", gs.preview_hunk, "Preview hunk")
                    map("n", "gu", gs.reset_hunk,   "Reset hunk")
                end,
            })
        end,
    },

    -- Fugitive (Git wrapper)
    {
        "tpope/vim-fugitive",
        event = "VeryLazy",
        dependencies = { "tpope/vim-rhubarb" },  -- GitHub integration
        keys = {
            { "<leader>gs",  ":G status<cr>",     silent = true, desc = "Git status" },
            { "<leader>gw",  ":Gwrite<cr>",       silent = true, desc = "Git write" },
            { "<leader>ga",  ":G add .<cr>",      silent = true, desc = "Git add all" },
            { "<leader>gc",  ":G commit<cr>",     silent = true, desc = "Git commit" },
            { "<leader>gb",  ":G blame<cr>",      silent = true, desc = "Git blame" },
            { "<leader>gbr", ":GBrowse<cr>",      silent = true, desc = "Git browse" },
            { "<leader>gd",  ":Gvdiffsplit!<cr>", silent = true, desc = "Git diff" },
            { "gdh", ":diffget //2<cr>", silent = true, desc = "Take left (ours)" },
            { "gdl", ":diffget //3<cr>", silent = true, desc = "Take right (theirs)" },
        },
    },

    -- Diff viewer
    {
        "sindrets/diffview.nvim",
        cmd = { "DiffviewOpen", "DiffviewFileHistory", "DiffviewClose" },
        keys = {
            { "<leader>dvh", ":DiffviewFileHistory<cr>", silent = true, desc = "File history" },
            { "<leader>dvo", ":DiffviewOpen<cr>",        silent = true, desc = "Open diff" },
            { "<leader>dvc", ":DiffviewClose<cr>",       silent = true, desc = "Close diff" },
        },
        dependencies = { "nvim-lua/plenary.nvim" },
    },

    -- Branch viewer / Git log
    { "sodapopcan/vim-twiggy", cmd = "Twiggy" },
    { "rbong/vim-flog",        cmd = { "Flog", "Flogsplit" } },

    ---------------------------------------------------------------------------
    -- Fuzzy Finder (FZF)
    ---------------------------------------------------------------------------
    {
        "junegunn/fzf.vim",
        cmd = { "Files", "GFiles", "Buffers", "Colors", "Rg" },
        dependencies = { "junegunn/fzf" },
        keys = {
            -- Smart file finder: git files if in a repo, all files otherwise
            { "<leader>t", function()
                if vim.fn.isdirectory(".git") == 1 then
                    vim.cmd("GFiles")
                else
                    vim.cmd("Files")
                end
            end, desc = "Find files" },
            { "<leader>s", ":GFiles?<cr>",  silent = true, desc = "Git status files" },
            { "<leader>r", ":Buffers<cr>",  silent = true, desc = "Open buffers" },
            { "<leader>e", ":Files<cr>",    silent = true, desc = "All files" },
            { "<leader>c", ":Colors<cr>",   silent = true, desc = "Colorschemes" },
            { "<leader><tab>", "<plug>(fzf-maps-n)", desc = "FZF maps" },
            { "<leader><tab>", "<plug>(fzf-maps-x)", mode = "x" },
            { "<leader><tab>", "<plug>(fzf-maps-o)", mode = "o" },
        },
        init = function()
            vim.g.fzf_layout = { window = { width = 0.9, height = 0.9 } }
            vim.g.fzf_preview_window = { "right,60%" }
            vim.env.FZF_DEFAULT_COMMAND = 'rg --files --ignore-case --hidden -g "!{.git,node_modules,vendor}/*"'
        end,
        config = function()
            -- Sync BAT_THEME with the current vim background
            vim.cmd([[
                augroup update_bat_theme
                    autocmd!
                    autocmd colorscheme * call ToggleBatEnvVar()
                augroup end
                function! ToggleBatEnvVar()
                    if (&background == "light")
                        let $BAT_THEME='OneHalfLight'
                        let $FZF_DEFAULT_OPTS = '--color=light'
                    else
                        let $BAT_THEME='OneHalfDark'
                        let $FZF_DEFAULT_OPTS = '--color=dark'
                    endif
                endfunction
            ]])

            -- Insert-mode FZF completions
            vim.cmd([[
                imap <c-x><c-k> <plug>(fzf-complete-word)
                imap <c-x><c-f> <plug>(fzf-complete-path)
                imap <c-x><c-j> <plug>(fzf-complete-file-ag)
                imap <c-x><c-l> <plug>(fzf-complete-line)
            ]])
        end,
    },

    ---------------------------------------------------------------------------
    -- LSP & Completion (plugin declarations only; config in lsp.lua etc.)
    ---------------------------------------------------------------------------

    -- LSP server management
    {
        "williamboman/mason.nvim",
        lazy = false,
        dependencies = {
            "williamboman/mason-lspconfig.nvim",
            "neovim/nvim-lspconfig",
        },
    },

    -- Autocompletion engine + sources
    {
        "hrsh7th/nvim-cmp",
        event = "InsertEnter",
        dependencies = {
            "hrsh7th/cmp-nvim-lsp",          -- LSP completions
            "hrsh7th/cmp-buffer",            -- Buffer word completions
            "hrsh7th/cmp-path",              -- File path completions
            "saadparwaiz1/cmp_luasnip",      -- Snippet completions
            {
                "L3MON4D3/LuaSnip",         -- Snippet engine
                build = "make install_jsregexp",
                dependencies = { "rafamadriz/friendly-snippets" },
            },
        },
    },

    -- Auto-pairs (brackets, quotes)
    {
        "windwp/nvim-autopairs",
        event = "InsertEnter",
        config = function() require("nvim-autopairs").setup() end,
    },

    -- Code formatting (prettier etc.)
    {
        "stevearc/conform.nvim",
        event = "BufWritePre",
        cmd = "ConformInfo",
    },

    ---------------------------------------------------------------------------
    -- File Explorer
    ---------------------------------------------------------------------------
    {
        "nvim-tree/nvim-tree.lua",
        cmd = { "NvimTreeToggle", "NvimTreeFocus" },
        keys = {
            { "<leader>k", ":NvimTreeToggle<cr>", silent = true, desc = "Toggle explorer" },
        },
        config = function()
            local api = require("nvim-tree.api")
            require("nvim-tree").setup({
                disable_netrw = false,           -- Keep :Explore working
                hijack_netrw  = false,
                view = { width = 50, side = "left" },
                on_attach = function(bufnr)
                    api.config.mappings.default_on_attach(bufnr)
                    -- E: open file in a new vertical split
                    vim.keymap.set("n", "E", function()
                        local node = api.tree.get_node_under_cursor()
                        if node then
                            vim.cmd("wincmd l")
                            vim.cmd("vsplit " .. vim.fn.fnameescape(node.absolute_path))
                        end
                    end, { buffer = bufnr, desc = "Open in vsplit" })
                end,
                renderer = {
                    icons = { show = { git = true, folder = true, file = true } },
                },
                filters = { dotfiles = false },
                git = { enable = true },
            })
        end,
    },

    ---------------------------------------------------------------------------
    -- Treesitter (syntax highlighting, indentation, folding)
    ---------------------------------------------------------------------------
    {
        "nvim-treesitter/nvim-treesitter",
        build = ":TSUpdate",
        event = { "BufReadPost", "BufNewFile" },
        config = function()
            local parsers = {
                "javascript", "typescript", "tsx", "json",
                "python", "ruby", "elixir",
                "terraform", "hcl",
                "dockerfile", "graphql", "solidity",
                "html", "css",
                "markdown", "markdown_inline",
                "lua", "vim", "vimdoc",
                "bash", "yaml", "toml",
                "gitcommit", "diff",
            }
            for _, lang in ipairs(parsers) do
                pcall(function() vim.cmd("TSInstall! " .. lang) end)
            end

            -- Register TSX for React filetypes
            vim.treesitter.language.register("tsx", "typescriptreact")
            vim.treesitter.language.register("tsx", "javascriptreact")

            -- Don't conceal JSON quotes
            vim.g.vim_json_syntax_conceal = 0
        end,
    },

    ---------------------------------------------------------------------------
    -- Filetype-Specific
    ---------------------------------------------------------------------------

    -- Open Markdown in Marked.app
    {
        "itspriddle/vim-marked",
        ft = "markdown",
        cmd = "MarkedOpen",
        keys = {
            { "<leader>m",  ":MarkedOpen!<cr>", desc = "Open in Marked" },
            { "<leader>mq", ":MarkedQuit<cr>",  desc = "Quit Marked" },
        },
    },

}, {
    ui = { border = "rounded" },
    performance = { rtp = { disabled_plugins = {} } },
})
