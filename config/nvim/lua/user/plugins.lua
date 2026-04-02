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

    -- LightLine
    {
        "itchyny/lightline.vim",
        lazy = false,
        dependencies = { "nicknisi/vim-base16-lightline" },
        init = function()
            vim.g.lightline = {
                colorscheme = "one",
                active = {
                    left = {
                        { "mode", "paste" },
                        { "gitbranch" },
                        { "readonly", "filetype", "filename" },
                    },
                    right = {
                        { "percent", "lineinfo" },
                        { "fileformat", "fileencoding" },
                        { "gitblame", "currentfunction", "cocstatus", "linter_errors", "linter_warnings" },
                    },
                },
                component_expand = vim.empty_dict(),
                component_type = {
                    readonly = "error",
                    linter_warnings = "warning",
                    linter_errors = "error",
                },
                component_function = {
                    gitbranch = "helpers#lightline#gitbranch",
                    cocstatus = "coc#status",
                    filename = "helpers#lightline#fileName",
                    fileencoding = "helpers#lightline#fileEncoding",
                    fileformat = "helpers#lightline#fileFormat",
                    filetype = "helpers#lightline#fileType",
                    currentfunction = "helpers#lightline#currentFunction",
                    gitblame = "helpers#lightline#gitBlame",
                },
                tabline = {
                    left = { { "tabs" } },
                    right = { { "close" } },
                },
                tab = {
                    active = { "filename", "modified" },
                    inactive = { "filename", "modified" },
                },
                separator = { left = "", right = "" },
                subseparator = { left = "", right = "" },
            }
        end,
    },

    -- Tpope essentials
    { "tpope/vim-abolish", event = "VeryLazy" },
    { "tpope/vim-commentary", event = "VeryLazy" },
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

    -- Git signs in gutter
    {
        "mhinz/vim-signify",
        event = "VeryLazy",
        init = function()
            vim.g.signify_vcs_list = { "git" }
            vim.g.signify_sign_add = "┃"
            vim.g.signify_sign_delete = "-"
            vim.g.signify_sign_delete_first_line = "_"
            vim.g.signify_sign_change = "┃"
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

    -- Icons
    { "ryanoasis/vim-devicons", lazy = false, init = function()
        vim.g.WebDevIconsOS = "Darwin"
        vim.g.WebDevIconsUnicodeDecorateFolderNodes = 1
        vim.g.DevIconsEnableFoldersOpenClose = 1
        vim.g.DevIconsEnableFolderExtensionPatternMatching = 1
    end },
    { "kyazdani42/nvim-web-devicons", lazy = false },

    -- Snippets
    { "honza/vim-snippets", event = "VeryLazy" },
    {
        "SirVer/ultisnips",
        event = "VeryLazy",
        init = function()
            vim.g.UltiSnipsExpandTrigger = "<nop>"
        end,
    },

    -- CoC
    {
        "neoclide/coc.nvim",
        branch = "release",
        lazy = false,
        config = function()
            vim.g.coc_global_extensions = {
                "coc-pyright",
                "coc-json",
                "coc-tsserver",
                "coc-git",
                "coc-explorer",
                "coc-prettier",
                "coc-eslint",
                "coc-lists",
                "coc-diagnostic",
                "coc-elixir",
                "coc-solargraph",
                "coc-snippets",
                "coc-ultisnips",
                "coc-vimlsp",
                "coc-docker",
                "coc-groovy",
                "coc-markdownlint",
                "coc-pairs",
                "coc-xml",
            }

            -- Highlight on cursor hold
            vim.cmd("autocmd CursorHold * silent call CocActionAsync('highlight')")

            -- Explorer
            vim.keymap.set("n", "<leader>k", ":CocCommand explorer<cr>", { silent = true })

            -- Prettier
            vim.api.nvim_create_user_command("Prettier", "CocCommand prettier.forceFormatDocument", {})
            vim.keymap.set("n", "<leader>f", ":CocCommand prettier.forceFormatDocument<cr>")

            -- Git chunks
            vim.keymap.set("n", "[g", "<Plug>(coc-git-prevchunk)")
            vim.keymap.set("n", "]g", "<Plug>(coc-git-nextchunk)")
            vim.keymap.set("n", "gs", "<Plug>(coc-git-chunkinfo)")
            vim.keymap.set("n", "gu", ":CocCommand git.chunkUndo<cr>")

            -- Gotos
            vim.keymap.set("n", "gd", "<Plug>(coc-definition)", { silent = true })
            vim.keymap.set("n", "gy", "<Plug>(coc-type-definition)", { silent = true })
            vim.keymap.set("n", "gi", "<Plug>(coc-implementation)", { silent = true })
            vim.keymap.set("n", "gr", "<Plug>(coc-references)", { silent = true })
            vim.keymap.set("n", "gh", "<Plug>(coc-doHover)", { silent = true })

            -- Diagnostics
            vim.keymap.set("n", "[c", "<Plug>(coc-diagnostic-prev)", { silent = true })
            vim.keymap.set("n", "]c", "<Plug>(coc-diagnostic-next)", { silent = true })
            vim.keymap.set("n", "<leader>d", ":call CocAction('diagnosticToggle')<cr>", { silent = true })

            -- Rename
            vim.keymap.set("n", "<leader>rn", "<Plug>(coc-rename)", { silent = true })

            -- Code action
            vim.keymap.set("n", "do", "<Plug>(coc-codeaction)", { silent = true })

            -- Organize imports
            vim.api.nvim_create_user_command("OR", "call CocAction('runCommand', 'editor.action.organizeImport')", {})

            -- Show documentation
            vim.cmd([[
                function! s:show_documentation()
                    if (index(['vim','help'], &filetype) >= 0)
                        execute 'h '.expand('<cword>')
                    else
                        call CocAction('doHover')
                    endif
                endfunction
            ]])
            vim.keymap.set("n", "K", ":call <SID>show_documentation()<CR>", { silent = true })

            -- Snippets
            vim.cmd([[
                imap <C-l> <Plug>(coc-snippets-expand)
                vmap <C-j> <Plug>(coc-snippets-select)
                let g:coc_snippet_next = '<c-j>'
                let g:coc_snippet_prev = '<c-k>'
                imap <C-j> <Plug>(coc-snippets-expand-jump)
                xmap <leader>x <Plug>(coc-convert-snippet)
            ]])

            -- Tab completion
            vim.cmd([[
                inoremap <silent><expr> <TAB>
                    \ coc#pum#visible() ? coc#pum#next(1) :
                    \ <SID>check_back_space() ? "\<Tab>" :
                    \ coc#refresh()
                inoremap <expr><S-TAB> coc#pum#visible() ? coc#pum#prev(1) : "\<C-h>"

                function! s:check_back_space() abort
                    let col = col('.') - 1
                    return !col || getline('.')[col - 1]  =~# '\s'
                endfunction
            ]])

            -- Trigger completion
            vim.cmd([[inoremap <silent><expr> <c-space> coc#refresh()]])

            -- Confirm completion with CR
            vim.cmd([[
                inoremap <silent><expr> <cr> coc#pum#visible() ? coc#_select_confirm()
                    \: "\<C-g>u\<CR>\<c-r>=coc#on_enter()\<CR>"
            ]])
        end,
    },

    -- JSON
    {
        "elzr/vim-json",
        ft = "json",
        init = function()
            vim.g.vim_json_syntax_conceal = 0
        end,
    },

    -- Markdown
    {
        "itspriddle/vim-marked",
        ft = "markdown",
        cmd = "MarkedOpen",
        keys = {
            { "<leader>m", ":MarkedOpen!<cr>", desc = "Open in Marked" },
            { "<leader>mq", ":MarkedQuit<cr>", desc = "Quit Marked" },
        },
    },

    -- Javascript / Typescript
    {
        "pangloss/vim-javascript",
        ft = { "javascript", "javascriptreact" },
    },
    {
        "leafgarland/typescript-vim",
        ft = { "typescript", "typescriptreact" },
    },
    {
        "peitalin/vim-jsx-typescript",
        ft = { "javascriptreact", "typescriptreact" },
    },
    {
        "styled-components/vim-styled-components",
        branch = "main",
        ft = { "javascript", "typescript", "javascriptreact", "typescriptreact" },
    },

    -- Extra syntax
    { "ekalinin/Dockerfile.vim", ft = "dockerfile" },
    { "hashivim/vim-terraform", ft = { "terraform", "hcl" } },
    { "elixir-editors/vim-elixir", ft = "elixir" },
    { "vim-ruby/vim-ruby", ft = "ruby" },
    { "tomlion/vim-solidity", ft = "solidity" },
    { "jparise/vim-graphql", ft = "graphql" },

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

-- JS/TS syntax sync (needs to run regardless of lazy loading)
local js_augroup = vim.api.nvim_create_augroup("js_syntax_sync", { clear = true })
vim.api.nvim_create_autocmd("BufEnter", {
    group = js_augroup,
    pattern = { "*.js", "*.jsx", "*.ts", "*.tsx" },
    command = "syntax sync fromstart",
})
vim.api.nvim_create_autocmd("BufLeave", {
    group = js_augroup,
    pattern = { "*.js", "*.jsx", "*.ts", "*.tsx" },
    command = "syntax sync clear",
})
