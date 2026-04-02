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

            -- Apply theme customizations on every colorscheme change
            vim.api.nvim_create_autocmd("ColorScheme", {
                callback = function()
                    vim.api.nvim_set_hl(0, "Comment",    { fg = "#a0a0a0", italic = true })
                    vim.api.nvim_set_hl(0, "htmlArg",    { italic = true })
                    vim.api.nvim_set_hl(0, "xmlAttrib",  { italic = true })
                    vim.api.nvim_set_hl(0, "DiagnosticInfo", { fg = "Blue" })
                    vim.api.nvim_set_hl(0, "DiagnosticHint", { fg = "Grey" })
                end,
            })

            -- Toggle light/dark with <leader>th (neovim + alacritty + tmux)
            vim.keymap.set("n", "<C-x><C-t>", function()
                local is_light = vim.o.background == "light"
                local mode = is_light and "dark" or "light"

                -- Neovim
                vim.opt.background = mode
                vim.cmd.colorscheme("one")

                -- Alacritty + Tmux: toggle via shell script
                vim.fn.jobstart({ vim.fn.expand("~/.dotfiles/bin/toggle-theme"), mode }, { detach = true })
            end, { desc = "Toggle light/dark theme" })
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
    -- LSP & Completion
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

    -- JSON/YAML schema catalog
    { "b0o/SchemaStore.nvim", lazy = true },

    -- Autocompletion (blink.cmp)
    {
        "saghen/blink.cmp",
        version = "1.*",
        lazy = false,
        opts = {
            keymap = {
                preset = "none",
                ["<Tab>"]     = { "select_next", "fallback" },
                ["<S-Tab>"]   = { "select_prev", "fallback" },
                ["<CR>"]      = { "accept", "fallback" },
                ["<C-Space>"] = { "show", "show_documentation", "hide_documentation" },
                ["<C-e>"]     = { "hide", "fallback" },
                ["<C-b>"]     = { "scroll_documentation_up", "fallback" },
                ["<C-f>"]     = { "scroll_documentation_down", "fallback" },
            },
            completion = {
                documentation = {
                    auto_show = true,
                    auto_show_delay_ms = 200,
                    window = {
                        border = "rounded",
                        winhighlight = "Normal:NormalFloat,FloatBorder:FloatBorder",
                    },
                },
                menu = {
                    border = "rounded",
                    winhighlight = "Normal:NormalFloat,FloatBorder:FloatBorder,CursorLine:PmenuSel,Search:None",
                    draw = {
                        columns = {
                            { "kind_icon", gap = 1 },
                            { "label", "label_description", gap = 1 },
                            { "source_name" },
                        },
                        components = {
                            source_name = {
                                text = function(ctx)
                                    local aliases = { lsp = "LSP", buffer = "Buf", path = "Path" }
                                    return "[" .. (aliases[ctx.source_id] or ctx.source_id) .. "]"
                                end,
                                highlight = "Comment",
                            },
                        },
                    },
                },
                list = {
                    selection = { preselect = false, auto_insert = false },
                },
                ghost_text = { enabled = true },
            },
            sources = {
                default = { "lsp", "path", "buffer" },
            },
        },
    },

    -- Auto-pairs (brackets, quotes)
    {
        "windwp/nvim-autopairs",
        event = "InsertEnter",
        config = function() require("nvim-autopairs").setup() end,
    },

    ---------------------------------------------------------------------------
    -- AI (Claude Code)
    ---------------------------------------------------------------------------
    {
        "coder/claudecode.nvim",
        dependencies = { "folke/snacks.nvim" },
        opts = {},
        keys = {
            { "<leader>ac", ":ClaudeCode<cr>",      silent = true, desc = "Toggle Claude Code" },
            { "<leader>as", ":ClaudeCodeSend<cr>",   silent = true, desc = "Send to Claude", mode = { "n", "v" } },
            { "<leader>aa", ":ClaudeCodeAdd<cr>",    silent = true, desc = "Add file to Claude" },
        },
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
            -- Single-keypress y/n prompts (no Enter needed)
            local original_input = vim.ui.input
            vim.ui.input = function(opts, on_confirm)
                if opts and opts.prompt and opts.prompt:match("[yYnN]/[yYnN]") then
                    vim.api.nvim_echo({{ opts.prompt }}, false, {})
                    local c = vim.fn.getchar()
                    local ch = type(c) == "number" and vim.fn.nr2char(c) or c
                    vim.cmd("redraw")
                    on_confirm(ch)
                else
                    original_input(opts, on_confirm)
                end
            end

            local api = require("nvim-tree.api")
            require("nvim-tree").setup({
                disable_netrw = false,           -- Keep :Explore working
                hijack_netrw  = false,
                view = { width = 50, side = "left" },
                on_attach = function(bufnr)
                    api.config.mappings.default_on_attach(bufnr)

                    -- Remove defaults that conflict with coc-explorer-style bindings
                    vim.keymap.del("n", "y", { buffer = bufnr })  -- default: copy name
                    vim.keymap.del("n", "d", { buffer = bufnr })  -- default: delete
                    vim.keymap.del("n", "x", { buffer = bufnr })  -- default: cut

                    -- Clipboard: yy=copy, dd=cut, p=paste
                    -- Single file: yy toggles in/out of copy clipboard
                    -- Multi-file: V to visual select, then yy/dd
                    vim.keymap.set("n", "yy", api.fs.copy.node, { buffer = bufnr, desc = "Copy file/directory" })
                    vim.keymap.set("v", "yy", api.fs.copy.node, { buffer = bufnr, desc = "Copy selected files" })
                    vim.keymap.set("n", "dd", api.fs.cut, { buffer = bufnr, desc = "Cut file/directory" })
                    vim.keymap.set("v", "dd", api.fs.cut, { buffer = bufnr, desc = "Cut selected files" })
                    -- p (paste) is already the default

                    -- Delete: df=trash, dF=permanent delete
                    vim.keymap.set("n", "df", api.fs.remove, { buffer = bufnr, desc = "Delete (trash)" })
                    vim.keymap.set("v", "df", api.fs.remove, { buffer = bufnr, desc = "Delete selected (trash)" })
                    vim.keymap.set("n", "dF", api.fs.remove, { buffer = bufnr, desc = "Delete permanently" })

                    -- Yank paths: yp=full path, yn=filename
                    vim.keymap.set("n", "yp", api.fs.copy.absolute_path, { buffer = bufnr, desc = "Copy absolute path" })
                    vim.keymap.set("n", "yn", api.fs.copy.filename, { buffer = bufnr, desc = "Copy filename" })

                    -- A: create a new directory
                    vim.keymap.set("n", "A", function()
                        local node = api.tree.get_node_under_cursor()
                        local parent = node and (node.type == "directory" and node.absolute_path or vim.fn.fnamemodify(node.absolute_path, ":h")) or vim.fn.getcwd()
                        vim.ui.input({ prompt = "New directory: ", default = parent .. "/" }, function(dir)
                            if dir and dir ~= "" then
                                vim.fn.mkdir(dir, "p")
                                api.tree.reload()
                            end
                        end)
                    end, { buffer = bufnr, desc = "Create directory" })

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
                    highlight_clipboard = "all",
                    icons = {
                        show = { git = true, folder = true, file = true, bookmarks = true },
                        glyphs = {
                            bookmark = "󰆤",
                        },
                    },
                },
                filters = { dotfiles = false },
                git = { enable = true },
            })

            -- Clipboard highlights: green for copied, red+strikethrough for cut
            vim.api.nvim_set_hl(0, "NvimTreeCopiedHL", { fg = "#5faf5f", bold = true })
            vim.api.nvim_set_hl(0, "NvimTreeCutHL", { fg = "#f38ba8", bold = true, strikethrough = true })
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
