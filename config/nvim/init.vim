" ensure vim-plug is installed and then load it
call functions#PlugLoad()
call plug#begin('~/.config/nvim/plugged')

" General

let g:python_host_prog="/usr/bin/python"

set history=1000 " change history to 1000

set backupdir=~/.vim-tmp,~/.tmp,~/tmp,/var/tmp,/tmp
set directory=~/.vim-tmp,~/.tmp,~/tmp,/var/tmp,/tmp

if (has('nvim'))
    " show results of substition as they're happening
    " but don't open a split
    set inccommand=nosplit
endif

set backspace=indent,eol,start " make backspace behave in a sane manner
set clipboard=unnamedplus

" if has('mouse')
"     set mouse=a
" endif
set mouse=

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
set wrap linebreak " turn on line wrapping
set wrapmargin=0 " wrap lines when coming within n characters from side
set textwidth=0 " disable automatic hard line breaking
set linebreak " set soft wrapping
set showbreak=↪
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
set updatetime=300
set signcolumn=yes
set shortmess+=c
set cursorline " enable cursorline highlilight
set cursorcolumn " enable cursorcolumn highlight"

" Tab control
set expandtab " insert spaces rather than tabs for <Tab>
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

" Smoother scrolling
Plug 'psliwka/vim-smoothie'

" Load colorschemes
Plug 'morhetz/gruvbox'

" LightLine
Plug 'itchyny/lightline.vim'
Plug 'nicknisi/vim-base16-lightline'

" Custom theme and project relative path
let g:lightline = {
\   'colorscheme': 'gruvbox',
\   'active': {
\       'left': [ [ 'mode', 'paste' ],
\               [ 'gitbranch' ],
\               [ 'readonly', 'filetype', 'filename' ]],
\       'right': [ [ 'percent', 'lineinfo' ],
\                [ 'fileformat', 'fileencoding' ],
\                [ 'gitblame', 'currentfunction', 'cocstatus', 'linter_errors', 'linter_warnings' ] ]
\   },
\   'component_expand': {
\   },
\   'component_type': {
\       'readonly': 'error',
\       'linter_warnings': 'warning',
\       'linter_errors': 'error'
\   },
\   'component_function': {
\       'gitbranch': 'helpers#lightline#gitbranch',
\       'cocstatus': 'coc#status',
\       'filename': 'helpers#lightline#fileName',
\       'fileencoding': 'helpers#lightline#fileEncoding',
\       'fileformat': 'helpers#lightline#fileFormat',
\       'filetype': 'helpers#lightline#fileType',
\       'currentfunction': 'helpers#lightline#currentFunction',
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

    autocmd vimenter * ++nested colorscheme gruvbox
augroup END

" General Functionality
" better terminal integration
" substitute, search, and abbreviate multiple variants of a word
Plug 'tpope/vim-abolish'

" search inside files using ripgrep. This plugin provides an Ack command.
Plug 'wincent/ferret'

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

" signify
Plug 'mhinz/vim-signify'
let g:signify_vcs_list = [ 'git' ]
let g:signify_sign_add = '┃'
let g:signify_sign_delete = '-'
let g:signify_sign_delete_first_line = '_'
let g:signify_sign_change = '┃'

" context-aware pasting
Plug 'sickill/vim-pasta'

" FZF
Plug '/usr/local/opt/fzf'
Plug 'junegunn/fzf'
Plug 'junegunn/fzf.vim'
let g:fzf_layout = { 'down': '~25%' }
"let g:fzf_prefer_tmux = 1

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
    \ 'rg --column --line-number --no-heading --follow --color=always '.<q-args>.' || true', 1,
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

" git diff view
Plug 'nvim-lua/plenary.nvim'
Plug 'sindrets/diffview.nvim'
nmap <silent> <leader>dvh :DiffviewFileHistory<cr>
nmap <silent> <leader>dvo :DiffviewOpen<cr>
nmap <silent> <leader>dvc :DiffviewClose<cr>

" vim-fugitive
Plug 'tpope/vim-fugitive'

" Git shortcuts
nmap <silent> <leader>gs :G status<cr>
nmap <silent> <leader>gw :Gwrite<cr>
nmap <silent> <leader>gd :Gdiff<cr>
nmap <silent><leader>ga :G add .<cr>
nmap <silent><leader>gc :G commit<cr>
nmap <silent><leader>gb :G blame<cr>
nmap <silent><leader>gbr :GBrowse<cr>
nmap <silent><leader>gd :Gvdiffsplit!<cr>
nmap <silent>gdh :diffget //2<cr>
nmap <silent>gdl :diffget //3<cr>

Plug 'tpope/vim-rhubarb' " hub extension for fugitive
Plug 'sodapopcan/vim-twiggy'
Plug 'rbong/vim-flog'
Plug 'honza/vim-snippets' " Snippets files

Plug 'ryanoasis/vim-devicons'
Plug 'kyazdani42/nvim-web-devicons'
let g:WebDevIconsOS = 'Darwin'
let g:WebDevIconsUnicodeDecorateFolderNodes = 1
let g:DevIconsEnableFoldersOpenClose = 1
let g:DevIconsEnableFolderExtensionPatternMatching = 1

" Snippets plugin
Plug 'SirVer/ultisnips'
" Disable the default Ultisnips tab mapping to free up coc
let g:UltiSnipsExpandTrigger = "<nop>"

Plug 'neoclide/coc.nvim', {'branch': 'release'}

let g:coc_global_extensions = [
  \ 'coc-pyright',
  \ 'coc-json',
  \ 'coc-tsserver',
  \ 'coc-git',
  \ 'coc-explorer',
  \ 'coc-prettier',
  \ 'coc-eslint',
  \ 'coc-lists',
  \ 'coc-diagnostic',
  \ 'coc-elixir',
  \ 'coc-solargraph',
  \ 'coc-snippets',
  \ 'coc-ultisnips',
  \ 'coc-vimlsp',
  \ 'coc-docker',
  \ 'coc-groovy',
  \ 'coc-markdownlint',
  \ 'coc-pairs',
  \ 'coc-xml'
  \ ]

autocmd CursorHold * silent call CocActionAsync('highlight')

nmap <silent> <leader>k :CocCommand explorer<cr>

" coc-prettier
command! -nargs=0 Prettier :CocCommand prettier.forceFormatDocument
nmap <leader>f :CocCommand prettier.forceFormatDocument<cr>

" coc-git
nmap [g <Plug>(coc-git-prevchunk)
nmap ]g <Plug>(coc-git-nextchunk)
nmap gs <Plug>(coc-git-chunkinfo)
nmap gu :CocCommand git.chunkUndo<cr>

nmap <silent> <leader>k :CocCommand explorer<cr>

"remap keys for gotos
nmap <silent> gd <Plug>(coc-definition)
nmap <silent> gy <Plug>(coc-type-definition)
nmap <silent> gi <Plug>(coc-implementation)
nmap <silent> gr <Plug>(coc-references)
nmap <silent> gh <Plug>(coc-doHover)

" diagnostics navigation
nmap <silent> [c <Plug>(coc-diagnostic-prev)
nmap <silent> ]c <Plug>(coc-diagnostic-next)

" diagnostics toggle
nmap <silent> <leader>d :call CocAction('diagnosticToggle')<cr>

" rename
nmap <silent> <leader>rn <Plug>(coc-rename)

" automated fix issues
nmap <silent> do <Plug>(coc-codeaction)

" organize imports
command! -nargs=0 OR :call CocAction('runCommand', 'editor.action.organizeImport')

" Use K to show documentation in preview window
nnoremap <silent> K :call <SID>show_documentation()<CR>

function! s:show_documentation()
  if (index(['vim','help'], &filetype) >= 0)
      execute 'h '.expand('<cword>')
  else
      call CocAction('doHover')
  endif
endfunction

" Snippet navigation

" Use <C-l> for trigger snippet expand.
imap <C-l> <Plug>(coc-snippets-expand)

" Use <C-j> for select text for visual placeholder of snippet.
vmap <C-j> <Plug>(coc-snippets-select)

" Use <C-j> for jump to next placeholder, it's default of coc.nvim
let g:coc_snippet_next = '<c-j>'

" Use <C-k> for jump to previous placeholder, it's default of coc.nvim
let g:coc_snippet_prev = '<c-k>'

" Use <C-j> for both expand and jump (make expand higher priority.)
imap <C-j> <Plug>(coc-snippets-expand-jump)

" Use <leader>x for convert visual selected code to snippet
xmap <leader>x  <Plug>(coc-convert-snippet)

"tab completion
inoremap <silent><expr> <TAB>
  \ coc#pum#visible() ? coc#pum#next(1) :
  \ <SID>check_back_space() ? "\<Tab>" :
  \ coc#refresh()
inoremap <expr><S-TAB> coc#pum#visible() ? coc#pum#prev(1) : "\<C-h>"

function! s:check_back_space() abort
  let col = col('.') - 1
  return !col || getline('.')[col - 1]  =~# '\s'
endfunction

" Use <c-space> to trigger completion.
if has('nvim')
  inoremap <silent><expr> <c-space> coc#refresh()
else
  inoremap <silent><expr> <c-@> coc#refresh()
endif

" Use <cr> to confirm completion, `<C-g>u` means break undo chain at current
" position. Coc only does snippet and additional edit on confirm.
" <cr> could be remapped by other vim plugin, try `:verbose imap <CR>`.
if exists('*complete_info')
  inoremap <expr> <cr> complete_info()["selected"] != "-1" ? "\<C-y>" : "\<C-g>u\<CR>"
else
  inoremap <expr> <cr> coc#pum#visible() ? "\<C-y>" : "\<C-g>u\<CR>"
endif

" For enhanced <CR> experience with coc-pairs checkout :h coc#on_enter()
inoremap <silent><expr> <cr> coc#pum#visible() ? coc#_select_confirm()
  \: "\<C-g>u\<CR>\<c-r>=coc#on_enter()\<CR>"

" JSON
Plug 'elzr/vim-json', { 'for': 'json' }
let g:vim_json_syntax_conceal = 0

" markdown {{{
    " Open markdown files in Marked.app - mapped to <leader>m
    Plug 'itspriddle/vim-marked', { 'for': 'markdown', 'on': 'MarkedOpen' }
    nmap <leader>m :MarkedOpen!<cr>
    nmap <leader>mq :MarkedQuit<cr>
    nmap <leader>* *<c-o>:%s///gn<cr>
" }}}

" Javascript {{{
    Plug 'pangloss/vim-javascript'
    Plug 'leafgarland/typescript-vim'
    Plug 'peitalin/vim-jsx-typescript'
    Plug 'styled-components/vim-styled-components', { 'branch': 'main' }

    " Force vim to rescan entire buffer when highlighting for js file
    autocmd BufEnter *.{js,jsx,ts,tsx} :syntax sync fromstart
    autocmd BufLeave *.{js,jsx,ts,tsx} :syntax sync clear
" }}}

" Extra Syntax Highlight
Plug 'ekalinin/Dockerfile.vim'
Plug 'hashivim/vim-terraform'
" Using vim-plug
Plug 'elixir-editors/vim-elixir'
" Ruby
Plug 'vim-ruby/vim-ruby'
" Solidity
Plug 'tomlion/vim-solidity'
" GraphQL
Plug 'jparise/vim-graphql'

call plug#end()

" Colorscheme and final setup
" This call must happen after the plug#end() call to ensure
" that the colorschemes have been loaded
if filereadable(expand("~/.vimrc_background"))
    let base16colorspace=256
    source ~/.vimrc_background
else
    set background=dark
    let g:gruvbox_contrast_dark='hard'
    let g:gruvbox_contrast_light='hard'
    colorscheme gruvbox
endif
syntax on
filetype plugin indent on

" make the cursor target precise
" highlight Cursor guibg=white guifg=white
" highlight CursorLine guibg=NONE gui=underline cterm=underline
" highlight CursorColumn guibg=#1D1F21 ctermbg=NONE gui=NONE cterm=NONE

" make the highlighting of tabs and other non-text less annoying
" highlight SpecialKey ctermfg=19 guifg=#444444
" highlight NonText ctermfg=19 guifg=#444444

" make comments and HTML attributes italic
highlight Comment cterm=italic term=italic gui=italic
highlight htmlArg cterm=italic term=italic gui=italic
highlight xmlAttrib cterm=italic term=italic gui=italic

" make the coc autocompletion smarter
highlight CocFloating guifg=GruvboxFg0 guibg=GruvboxBg0
highlight CocMenuSel guifg=GruvboxFg0 guibg=gray

" Better tabbing
vnoremap < <gv
vnoremap > >gv
