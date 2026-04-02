-- Bootstrap lazy.nvim
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
    vim.fn.system({
        "git", "clone", "--filter=blob:none",
        "https://github.com/folke/lazy.nvim.git",
        "--branch=stable", lazypath,
    })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({

    -- Colorscheme
    {
        "rakr/vim-one",
        lazy = false,
        priority = 1000,
        config = function()
            if vim.fn.filereadable(vim.fn.expand("~/.vimrc_background")) == 1 then
                vim.g.base16colorspace = 256
                vim.cmd("source ~/.vimrc_background")
            else
                vim.opt.background = "light"
                vim.cmd("colorscheme one")
            end
            vim.cmd("syntax on")
            vim.cmd("filetype plugin indent on")

            -- Italic comments and HTML attributes
            vim.cmd("highlight Comment cterm=italic term=italic gui=italic")
            vim.cmd("highlight htmlArg cterm=italic term=italic gui=italic")
            vim.cmd("highlight xmlAttrib cterm=italic term=italic gui=italic")

            -- Floating menu colors
            vim.cmd("highlight DiagnosticInfo ctermfg=4 guifg=Blue")
            vim.cmd("highlight DiagnosticHint ctermfg=7 guifg=Grey")
        end,
    },

    -- Smoother scrolling
    { "psliwka/vim-smoothie", event = "VeryLazy" },

    -- Lualine (statusline)
    {
        "nvim-lualine/lualine.nvim",
        lazy = false,
        dependencies = { "kyazdani42/nvim-web-devicons" },
        config = function()
            local function git_blame()
                if vim.fn.winwidth(0) <= 100 then return "" end
                local blame = vim.b.gitsigns_blame_line or ""
                blame = blame:gsub("[()]", "")
                return blame:sub(1, 50)
            end

            require("lualine").setup({
                options = {
                    theme = "auto",
                    section_separators = { left = "", right = "" },
                    component_separators = { left = "", right = "" },
                },
                sections = {
                    lualine_a = { "mode" },
                    lualine_b = { "branch" },
                    lualine_c = {
                        { "filetype", icon_only = true, separator = "", padding = { left = 1, right = 0 } },
                        { "filename", path = 1 },
                    },
                    lualine_x = {
                        { git_blame },
                        "diagnostics",
                    },
                    lualine_y = { "encoding", "fileformat" },
                    lualine_z = { "progress", "location" },
                },
                tabline = {},
            })
        end,
    },

    -- Tpope essentials
    { "tpope/vim-abolish", event = "VeryLazy" },
    {
        "numToStr/Comment.nvim",
        event = "VeryLazy",
        config = function()
            require("Comment").setup()
        end,
    },
    { "tpope/vim-unimpaired", event = "VeryLazy" },
    { "tpope/vim-ragtag", event = "VeryLazy" },
    { "tpope/vim-surround", event = "VeryLazy" },
    { "tpope/vim-repeat", event = "VeryLazy" },
    { "tpope/vim-sleuth", event = "VeryLazy" },

    -- Search with ripgrep
    { "wincent/ferret", event = "VeryLazy" },

    -- Tmux integration
    { "benmills/vimux", cmd = { "VimuxRunCommand", "VimuxPromptCommand", "VimuxRunLastCommand" } },

    -- Session management
    { "tpope/vim-obsession", event = "VeryLazy" },
    {
        "dhruvasagar/vim-prosession",
        event = "VeryLazy",
        dependencies = { "tpope/vim-obsession" },
    },

    -- EditorConfig
    { "editorconfig/editorconfig-vim", event = "VeryLazy" },

    -- Split/join lines
    { "AndrewRadev/splitjoin.vim", event = "VeryLazy" },

    -- Startify
    {
        "mhinz/vim-startify",
        lazy = false,
        init = function()
            vim.g.startify_files_number = 5
            vim.g.startify_change_to_dir = 0
            vim.g.startify_custom_header = {}
            vim.g.startify_relative_path = 1
            vim.g.startify_use_env = 1

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
            -- startify_lists uses vimscript function() refs that need vim.cmd
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

    -- Close buffers without closing splits
    {
        "moll/vim-bbye",
        cmd = "Bdelete",
        keys = { { "<leader>b", ":Bdelete<cr>", desc = "Delete buffer" } },
    },

    -- Git signs, blame, hunk navigation (replaces vim-signify + coc-git)
    {
        "lewis6991/gitsigns.nvim",
        event = "VeryLazy",
        config = function()
            require("gitsigns").setup({
                signs = {
                    add = { text = "┃" },
                    change = { text = "┃" },
                    delete = { text = "-" },
                    topdelete = { text = "_" },
                    changedelete = { text = "┃" },
                },
                current_line_blame = false,
                on_attach = function(bufnr)
                    local gs = package.loaded.gitsigns
                    local map = function(mode, l, r, desc)
                        vim.keymap.set(mode, l, r, { buffer = bufnr, silent = true, desc = desc })
                    end
                    map("n", "]g", gs.next_hunk, "Next git hunk")
                    map("n", "[g", gs.prev_hunk, "Previous git hunk")
                    map("n", "gs", gs.preview_hunk, "Preview hunk")
                    map("n", "gu", gs.reset_hunk, "Reset hunk")
                end,
            })
        end,
    },

    -- Context-aware pasting
    { "sickill/vim-pasta", event = "VeryLazy" },

    -- FZF
    {
        "junegunn/fzf.vim",
        cmd = { "Files", "GFiles", "Buffers", "Colors", "Rg" },
        keys = {
            { "<leader>t", function()
                if vim.fn.isdirectory(".git") == 1 then
                    vim.cmd("GFiles")
                else
                    vim.cmd("Files")
                end
            end, desc = "Find files" },
            { "<leader>s", ":GFiles?<cr>", silent = true, desc = "Git status files" },
            { "<leader>r", ":Buffers<cr>", silent = true, desc = "Buffers" },
            { "<leader>e", ":Files<cr>", silent = true, desc = "All files" },
            { "<leader>c", ":Colors<cr>", silent = true, desc = "Colorschemes" },
            { "<leader><tab>", "<plug>(fzf-maps-n)", desc = "FZF maps" },
            { "<leader><tab>", "<plug>(fzf-maps-x)", mode = "x", desc = "FZF maps" },
            { "<leader><tab>", "<plug>(fzf-maps-o)", mode = "o", desc = "FZF maps" },
        },
        dependencies = { "junegunn/fzf" },
        init = function()
            vim.g.fzf_layout = { window = { width = 0.9, height = 0.9 } }
            vim.g.fzf_preview_window = { "right,60%" }
            vim.env.FZF_DEFAULT_COMMAND = 'rg --files --ignore-case --hidden -g "!{.git,node_modules,vendor}/*"'
        end,
        config = function()
            -- BAT_THEME toggle based on background
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

            -- Insert mode completion
            vim.cmd([[
                imap <c-x><c-k> <plug>(fzf-complete-word)
                imap <c-x><c-f> <plug>(fzf-complete-path)
                imap <c-x><c-j> <plug>(fzf-complete-file-ag)
                imap <c-x><c-l> <plug>(fzf-complete-line)
            ]])
        end,
    },

    -- Git diff view
    {
        "sindrets/diffview.nvim",
        cmd = { "DiffviewOpen", "DiffviewFileHistory", "DiffviewClose" },
        keys = {
            { "<leader>dvh", ":DiffviewFileHistory<cr>", silent = true, desc = "Diffview history" },
            { "<leader>dvo", ":DiffviewOpen<cr>", silent = true, desc = "Diffview open" },
            { "<leader>dvc", ":DiffviewClose<cr>", silent = true, desc = "Diffview close" },
        },
        dependencies = { "nvim-lua/plenary.nvim" },
    },

    -- Git
    {
        "tpope/vim-fugitive",
        event = "VeryLazy",
        dependencies = { "tpope/vim-rhubarb" },
        keys = {
            { "<leader>gs", ":G status<cr>", silent = true, desc = "Git status" },
            { "<leader>gw", ":Gwrite<cr>", silent = true, desc = "Git write" },
            { "<leader>ga", ":G add .<cr>", silent = true, desc = "Git add all" },
            { "<leader>gc", ":G commit<cr>", silent = true, desc = "Git commit" },
            { "<leader>gb", ":G blame<cr>", silent = true, desc = "Git blame" },
            { "<leader>gbr", ":GBrowse<cr>", silent = true, desc = "Git browse" },
            { "<leader>gd", ":Gvdiffsplit!<cr>", silent = true, desc = "Git diff" },
            { "gdh", ":diffget //2<cr>", silent = true, desc = "Diffget left" },
            { "gdl", ":diffget //3<cr>", silent = true, desc = "Diffget right" },
        },
    },
    { "sodapopcan/vim-twiggy", cmd = "Twiggy" },
    { "rbong/vim-flog", cmd = { "Flog", "Flogsplit" } },

    -- Icons (Lua only, used by lualine, nvim-tree, etc.)
    { "kyazdani42/nvim-web-devicons", lazy = false },

    -- LSP
    {
        "williamboman/mason.nvim",
        lazy = false,
        dependencies = {
            "williamboman/mason-lspconfig.nvim",
            "neovim/nvim-lspconfig",
        },
    },

    -- Completion
    {
        "hrsh7th/nvim-cmp",
        event = "InsertEnter",
        dependencies = {
            "hrsh7th/cmp-nvim-lsp",
            "hrsh7th/cmp-buffer",
            "hrsh7th/cmp-path",
            "saadparwaiz1/cmp_luasnip",
            {
                "L3MON4D3/LuaSnip",
                build = "make install_jsregexp",
                dependencies = {
                    "rafamadriz/friendly-snippets",
                },
            },
        },
    },

    -- Auto-pairs (replaces coc-pairs)
    {
        "windwp/nvim-autopairs",
        event = "InsertEnter",
        config = function()
            require("nvim-autopairs").setup()
        end,
    },

    -- Formatting (replaces coc-prettier)
    {
        "stevearc/conform.nvim",
        event = "BufWritePre",
        cmd = "ConformInfo",
    },

    -- File explorer (replaces coc-explorer)
    {
        "nvim-tree/nvim-tree.lua",
        cmd = { "NvimTreeToggle", "NvimTreeFocus" },
        keys = {
            { "<leader>k", ":NvimTreeToggle<cr>", silent = true, desc = "Toggle file explorer" },
        },
        config = function()
            require("nvim-tree").setup({
                view = { width = 50, side = "left" },
                renderer = {
                    icons = { show = { git = true, folder = true, file = true } },
                },
                filters = { dotfiles = false },
                git = { enable = true },
            })
        end,
    },

    -- Treesitter (replaces all individual syntax plugins)
    {
        "nvim-treesitter/nvim-treesitter",
        build = ":TSUpdate",
        event = { "BufReadPost", "BufNewFile" },
        config = function()
            -- Install parsers
            local ensure_installed = {
                "javascript", "typescript", "tsx", "json",
                "python", "ruby", "elixir",
                "terraform", "hcl",
                "dockerfile",
                "graphql",
                "solidity",
                "html", "css",
                "markdown", "markdown_inline",
                "lua", "vim", "vimdoc",
                "bash", "yaml", "toml",
                "gitcommit", "diff",
            }
            for _, lang in ipairs(ensure_installed) do
                pcall(function() vim.cmd("TSInstall! " .. lang) end)
            end

            -- Enable treesitter highlighting and indentation
            vim.treesitter.language.register("tsx", "typescriptreact")
            vim.treesitter.language.register("tsx", "javascriptreact")

            -- Disable JSON conceal (matching old vim-json setting)
            vim.g.vim_json_syntax_conceal = 0
        end,
    },

    -- Markdown (open in Marked.app)
    {
        "itspriddle/vim-marked",
        ft = "markdown",
        cmd = "MarkedOpen",
        keys = {
            { "<leader>m", ":MarkedOpen!<cr>", desc = "Open in Marked" },
            { "<leader>mq", ":MarkedQuit<cr>", desc = "Quit Marked" },
        },
    },

}, {
    -- lazy.nvim options
    ui = {
        border = "rounded",
    },
    performance = {
        rtp = {
            disabled_plugins = {},
        },
    },
})

