" ensure vim-plug is installed and then load it
call functions#PlugLoad()
call plug#begin('~/.config/nvim/plugged')

" General
set autoread " detect when a file is changed

set history=1000 " change history to 1000

set backupdir=~/.vim-tmp,~/.tmp,~/tmp,/var/tmp,/tmp
set directory=~/.vim-tmp,~/.tmp,~/tmp,/var/tmp,/tmp

if (has('nvim'))
    " show results of substition as they're happening
    " but don't open a split
    set inccommand=nosplit
endif

set backspace=indent,eol,start " make backspace behave in a sane manner
set clipboard=unnamed

" Searching
set ignorecase " case insensitive searching
set smartcase " case-sensitive if expresson contains a capital letter
set hlsearch " highlight search results
set incsearch " set incremental search, like modern browsers
set nolazyredraw " don't redraw while executing macros

set magic " Set magic on, for regex

" error bells
set noerrorbells
set visualbell
set t_vb=
set tm=500

" Appearance
set number " show line numbers
set wrap " turn on line wrapping
set wrapmargin=8 " wrap lines when coming within n characters from side
set textwidth=0 " disable automatic hard line breaking
set linebreak " set soft wrapping
set showbreak=… " show ellipsis at breaking
set autoindent " automatically set indent of new line
set ttyfast " faster redrawing
set diffopt+=vertical,iwhite,internal,algorithm:patience,hiddenoff
set laststatus=2 " show the satus line all the time
set so=7 " set 7 lines to the cursors - when moving vertical
set wildmenu " enhanced command line completion
set hidden " current buffer can be put into background
set showcmd " show incomplete commands
set noshowmode " don't show which mode disabled for PowerLine
set wildmode=list:longest " complete files like a shell
set shell=$SHELL
set cmdheight=1 " command bar height
set title " set terminal title
set showmatch " show matching braces
set mat=2 " how many tenths of a second to blink
set cursorline "enable cursorline highlilight
set cursorcolumn "enable cursorcolumn highlight"

" Tab control
" set noexpandtab " insert tabs rather than spaces for <Tab>
set expandtab " insert spaces rarther than tabs for <Tab>
set smarttab " tab respects 'tabstop', 'shiftwidth', and 'softtabstop'
set tabstop=2 " the visible width of tabs
set softtabstop=2 " edit as if the tabs are 4 characters wide
set shiftwidth=2 " number of spaces to use for indent and unindent
set shiftround " round indent to a multiple of 'shiftwidth'

" code folding settings
set foldmethod=syntax " fold based on indent
set foldlevelstart=99
set foldnestmax=10 " deepest fold is 10 levels
set nofoldenable " don't fold by default
set foldlevel=1

" toggle invisible characters
set list
set listchars=tab:→\ ,eol:¬,trail:⋅,extends:❯,precedes:❮
set showbreak=↪

set t_Co=256 " Explicitly tell vim that the terminal supports 256 colors
" switch cursor to line when in insert mode, and block when not
set guicursor=n-v-c:block,i-ci-ve:ver25,r-cr:hor20,o:hor50
\,a:blinkwait700-blinkoff400-blinkon250-Cursor/lCursor
\,sm:block-blinkwait175-blinkoff150-blinkon175

if &term =~ '256color'
    " disable background color erase
    set t_ut=
endif

" enable 24 bit color support if supported
if (has("termguicolors"))
    if (!(has("nvim")))
        let &t_8f = "\<Esc>[38;2;%lu;%lu;%lum"
        let &t_8b = "\<Esc>[48;2;%lu;%lu;%lum"
    endif
    set termguicolors
endif

" highlight conflicts
match ErrorMsg '^\(<\|=\|>\)\{7\}\([^=].\+\)\?$'

" Also highlight all tabs and trailing whitespace characters.
highlight ExtraWhitespace ctermbg=darkgreen guibg=darkgreen
match ExtraWhitespace /\s\+$\|\t/

" Load colorschemes
Plug 'chriskempson/base16-vim'
Plug 'joshdick/onedark.vim'
Plug 'gosukiwi/vim-atom-dark'

" LightLine
Plug 'itchyny/lightline.vim'
Plug 'nicknisi/vim-base16-lightline'

" Custom theme and project relative path
let g:lightline = {
\   'colorscheme': 'base16',
\   'active': {
\       'left': [ [ 'mode', 'paste' ],
\               [ 'gitbranch' ],
\               [ 'readonly', 'filetype', 'filename' ]],
\       'right': [ [ 'percent', 'lineinfo' ],
\                [ 'fileformat', 'fileencoding' ],
\                [ 'gitblame', 'linter_errors', 'linter_warnings' ] ]
\   },
\   'component_expand': {
\   },
\   'component_type': {
\       'readonly': 'error',
\       'linter_warnings': 'warning',
\       'linter_errors': 'error'
\   },
\   'component_function': {
\       'gitbranch': 'helpers#lightline#gitBranch',
\       'filename': 'helpers#lightline#fileName',
\       'fileencoding': 'helpers#lightline#fileEncoding',
\       'fileformat': 'helpers#lightline#fileFormat',
\       'filetype': 'helpers#lightline#fileType',
\       'gitblame': 'helpers#lightline#gitBlame'
\   },
\   'tabline': {
\       'left': [ [ 'tabs' ] ],
\       'right': [ [ 'close' ] ]
\   },
\   'tab': {
\       'active': [ 'filename', 'modified' ],
\       'inactive': [ 'filename', 'modified' ],
\   },
\   'separator': { 'left': '', 'right': '' },
\   'subseparator': { 'left': '', 'right': '' }
\ }

" General Mappings

" set a map leader for more key combos
let mapleader="\<SPACE>" "Map the leader key to SPACE

" AutoGroups

" file type specific settings
augroup configgroup
	autocmd!

    " automatically resize panes on resize
    autocmd VimResized * exe 'normal! \<c-w>='
    autocmd BufWritePost .vimrc,.vimrc.local,init.vim source %
    autocmd BufWritePost .vimrc.local source %

    " save all files on focus lost, ignoring warnings about untitled buffers
    autocmd FocusLost * silent! wa

    " make quickfix windows take all the lower section of the screen
    " when there are multiple windows open
    autocmd FileType qf wincmd J
    autocmd FileType qf nmap <buffer> q :q<cr>
augroup END

" General Functionality
" better terminal integration
" substitute, search, and abbreviate multiple variants of a word
Plug 'tpope/vim-abolish'

" search inside files using ripgrep. This plugin provides an Ack command.
Plug 'wincent/ferret'

" insert or delete brackets, parens, quotes in pair
Plug 'jiangmiao/auto-pairs'

" easy commenting motions
Plug 'tpope/vim-commentary'

" mappings which are simply short normal mode aliases for commonly used ex commands
Plug 'tpope/vim-unimpaired'

" endings for html, xml, etc. - ehances surround
Plug 'tpope/vim-ragtag'

" mappings to easily delete, change and add such surroundings in pairs, such as quotes, parens, etc.
Plug 'tpope/vim-surround'

" tmux integration for vim
Plug 'benmills/vimux'

" enables repeating other supported plugins with the . command
Plug 'tpope/vim-repeat'

" continuously updated vim sessions
Plug 'tpope/vim-obsession'
Plug 'dhruvasagar/vim-prosession'

" .editorconfig support
Plug 'editorconfig/editorconfig-vim'

" single/multi line code handler: gS - split one line into multiple, gJ - combine multiple lines into one
Plug 'AndrewRadev/splitjoin.vim'

" add end, endif, etc. automatically
Plug 'tpope/vim-endwise'

" detect indent style (tabs vs. spaces)
Plug 'tpope/vim-sleuth'

Plug 'mhinz/vim-startify'
" Don't change to directory when selecting a file
let g:startify_files_number = 5
let g:startify_change_to_dir = 0
let g:startify_custom_header = [ ]
let g:startify_relative_path = 1
let g:startify_use_env = 1

function! s:list_commits()
    let git = 'git -C ' . getcwd()
    let commits = systemlist(git . ' log --oneline | head -n5')
    let git = 'G' . git[1:]
    return map(commits, '{"line": matchstr(v:val, "\\s\\zs.*"), "cmd": "'. git .' show ". matchstr(v:val, "^\\x\\+") }')
endfunction

" Custom startup list, only show MRU from current directory/project
let g:startify_lists = [
\  { 'type': 'dir',       'header': [ 'Files '. getcwd() ] },
\  { 'type': function('s:list_commits'), 'header': [ 'Recent Commits' ] },
\  { 'type': 'sessions',  'header': [ 'Sessions' ]       },
\  { 'type': 'bookmarks', 'header': [ 'Bookmarks' ]      },
\  { 'type': 'commands',  'header': [ 'Commands' ]       },
\ ]

let g:startify_commands = [
\   { 'up': [ 'Update Plugins', ':PlugUpdate' ] },
\   { 'ug': [ 'Upgrade Plugin Manager', ':PlugUpgrade' ] },
\ ]

let g:startify_bookmarks = [
    \ { 'c': '~/.dotfiles/config/nvim/init.vim' },
    \ { 'g': '~/.gitconfig' },
    \ { 'z': '~/.dotfiles/zsh/zshrc.symlink' }
\ ]

autocmd User Startified setlocal cursorline
nmap <leader>st :Startify<cr>

" Close buffers but keep splits
Plug 'moll/vim-bbye'
nmap <leader>b :Bdelete<cr>

" context-aware pasting
Plug 'sickill/vim-pasta'

" NERDTree
Plug 'scrooloose/nerdtree', { 'on': ['NERDTreeToggle', 'NERDTreeFind'] }
Plug 'Xuyuanp/nerdtree-git-plugin'
Plug 'ryanoasis/vim-devicons'
Plug 'tiagofumo/vim-nerdtree-syntax-highlight'
let g:WebDevIconsOS = 'Darwin'
let g:WebDevIconsUnicodeDecorateFolderNodes = 1
let g:DevIconsEnableFoldersOpenClose = 1
let g:DevIconsEnableFolderExtensionPatternMatching = 1
let NERDTreeDirArrowExpandable = "\u00a0" " make arrows invisible
let NERDTreeDirArrowCollapsible = "\u00a0" " make arrows invisible
let NERDTreeNodeDelimiter = "\u263a" " smiley face
let g:NERDTreeWinSize=30

augroup nerdtree
    autocmd!
    autocmd FileType nerdtree setlocal nolist " turn off whitespace characters
    autocmd FileType nerdtree setlocal nocursorline " turn off line highlighting for performance
augroup END

" Toggle NERDTree
function! ToggleNerdTree()
    if @% != "" && @% !~ "Startify" && (!exists("g:NERDTree") || (g:NERDTree.ExistsForTab() && !g:NERDTree.IsOpen()))
        :NERDTreeFind
    else
        :NERDTreeToggle
    endif
endfunction
" toggle nerd tree
nmap <silent> <leader>k :call ToggleNerdTree()<cr>
" find the current file in nerdtree without needing to reload the drawer
nmap <silent> <leader>y :NERDTreeFind<cr>

let NERDTreeShowHidden=1
let g:NERDTreeIndicatorMapCustom = {
\ "Modified"  : "✹",
\ "Staged"    : "✚",
\ "Untracked" : "✭",
\ "Renamed"   : "➜",
\ "Unmerged"  : "═",
\ "Deleted"   : "✖",
\ "Dirty"     : "✗",
\ "Clean"     : "✔︎",
\ 'Ignored'   : '☒',
\ "Unknown"   : "?"
\ }

" FZF
Plug '/usr/local/opt/fzf'
Plug 'junegunn/fzf.vim'
let g:fzf_layout = { 'down': '~25%' }
let g:fzf_prefer_tmux = 1

if isdirectory(".git")
    " if in a git project, use :GFiles
    nmap <silent> <leader>t :GitFiles --cached --others --exclude-standard<cr>
else
    " otherwise, use :FZF
    nmap <silent> <leader>t :FZF<cr>
endif

nmap <silent> <leader>s :GFiles?<cr>

nmap <silent> <leader>r :Buffers<cr>
nmap <silent> <leader>e :FZF<cr>
nmap <leader><tab> <plug>(fzf-maps-n)
xmap <leader><tab> <plug>(fzf-maps-x)
omap <leader><tab> <plug>(fzf-maps-o)

" Insert mode completion
imap <c-x><c-k> <plug>(fzf-complete-word)
imap <c-x><c-f> <plug>(fzf-compljte-path)
imap <c-x><c-j> <plug>(fzf-complete-file-ag)
imap <c-x><c-l> <plug>(fzf-complete-line)

nnoremap <silent> <Leader>C :call fzf#run({
\   'source':
\     map(split(globpath(&rtp, "colors/*.vim"), "\n"),
\         "substitute(fnamemodify(v:val, ':t'), '\\..\\{-}$', '', '')"),
\   'sink':    'colo',
\   'options': '+m',
\   'left':    30
\ })<CR>

command! FZFMru call fzf#run({
\  'source':  v:oldfiles,
\  'sink':    'e',
\  'options': '-m -x +s',
\  'down':    '40%'})

command! -bang -nargs=* Find call fzf#vim#grep(
    \ 'rg --column --line-number --no-heading --follow --color=always '.<q-args>, 1,
    \ <bang>0 ? fzf#vim#with_preview('up:60%') : fzf#vim#with_preview('right:50%:hidden', '?'), <bang>0)
command! -bang -nargs=? -complete=dir Files
    \ call fzf#vim#files(<q-args>, fzf#vim#with_preview('right:50%', '?'), <bang>0)
command! -bang -nargs=? -complete=dir GitFiles
    \ call fzf#vim#gitfiles(<q-args>, fzf#vim#with_preview('right:50%', '?'), <bang>0)
function! RipgrepFzf(query, fullscreen)
    let command_fmt = 'rg --column --line-number --no-heading --color=always --smart-case -- %s || true'
    let initial_command = printf(command_fmt, shellescape(a:query))
    let reload_command = printf(command_fmt, '{q}')
    let spec = {'options': ['--phony', '--query', a:query, '--bind', 'change:reload:'.reload_command]}
    call fzf#vim#grep(initial_command, 1, fzf#vim#with_preview(spec), a:fullscreen)
endfunction

command! -nargs=* -bang RG call RipgrepFzf(<q-args>, <bang>0)

" signify
Plug 'mhinz/vim-signify'
let g:signify_vcs_list = [ 'git' ]
let g:signify_sign_add = '┃'
let g:signify_sign_delete = '-'
let g:signify_sign_delete_first_line = '_'
let g:signify_sign_change = '┃'

" vim-fugitive
Plug 'tpope/vim-fugitive'
nmap <silent> <leader>gs :Gstatus<cr>
nmap <leader>ge :Gedit<cr>
nmap <silent><leader>gr :Gread<cr>
nmap <silent><leader>gb :Gblame<cr>

Plug 'tpope/vim-rhubarb' " hub extension for fugitive
" Plug 'junegunn/gv.vim'
Plug 'sodapopcan/vim-twiggy'
Plug 'rbong/vim-flog'

" ALE
Plug 'w0rp/ale' " Asynchonous linting engine
let g:ale_set_highlights = 0
let g:ale_change_sign_column_color = 0
let g:ale_sign_column_always = 1
let g:ale_fix_on_save = 1
let g:ale_lint_delay = 1000
let g:ale_lint_on_text_changed = 'always'
let g:ale_sign_error = '✖'
let g:ale_sign_warning = '⚠'
let g:ale_echo_msg_error_str = '✖'
let g:ale_echo_msg_warning_str = '⚠'
let g:ale_echo_msg_format = '%severity% %s% [%linter%% code%]'

let g:ale_linters = {
\   'javascript': ['eslint'],
\   'html': []
\}
let g:ale_fixers = {}
let g:ale_fixers['javascript'] = ['prettier']
let g:ale_fixers['json'] = ['prettier']
let g:ale_fixers['css'] = ['prettier']
let g:ale_javascript_prettier_use_local_config = 1
let g:ale_fix_on_save = 0
nmap <silent><leader>af :ALEFix<cr>

" Completion
if (has('nvim'))
    Plug 'Shougo/deoplete.nvim', { 'do': ':UpdateRemotePlugins' }
else
    Plug 'Shougo/deoplete.nvim'
    Plug 'roxma/nvim-yarp'
    Plug 'roxma/vim-hug-neovim-rpc'
endif
let g:deoplete#enable_at_startup = 1

" UltiSnips {{{
    Plug 'SirVer/ultisnips' " Snippets plugin
    Plug 'honza/vim-snippets'
    let g:UltiSnipsExpandTrigger="<tab>"
    let g:UltiSnipsJumpForwardTrigger="<C-j>"
    let g:UltiSnipsJumpBackwardTrigger="<C-k>"
" }}}

" JSON
Plug 'elzr/vim-json', { 'for': 'json' }
let g:vim_json_syntax_conceal = 0

" Extra Syntax Highlight
Plug 'ekalinin/Dockerfile.vim'
Plug 'hashivim/vim-terraform'

call plug#end()

" Colorscheme and final setup
" This call must happen after the plug#end() call to ensure
" that the colorschemes have been loaded
if filereadable(expand("~/.vimrc_background"))
    let base16colorspace=256
    source ~/.vimrc_background
else
    let g:onedark_termcolors=16
    let g:onedark_terminal_italics=1
    colorscheme atom-dark
endif
syntax on
filetype plugin indent on

" make the cursor target precise
highlight CursorLine guibg=NONE gui=underline cterm=underline
highlight CursorColumn guibg=#2C2C2C ctermbg=NONE gui=NONE cterm=NONE

" make the highlighting of tabs and other non-text less annoying
highlight SpecialKey ctermfg=19 guifg=#444444
highlight NonText ctermfg=19 guifg=#444444

" make comments and HTML attributes italic
highlight Comment cterm=italic term=italic gui=italic
highlight htmlArg cterm=italic term=italic gui=italic
highlight xmlAttrib cterm=italic term=italic gui=italic

" highlight Type cterm=italic term=italic gui=italic
highlight Normal ctermbg=none

call deoplete#custom#option({
\ 'auto_complete_delay': 200,
\ 'auto_refresh_delay': 100
\ })

