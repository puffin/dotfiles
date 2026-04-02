local augroup = vim.api.nvim_create_augroup("configgroup", { clear = true })
local autocmd = vim.api.nvim_create_autocmd

-- Automatically resize panes on window resize
autocmd("VimResized", {
    group = augroup,
    command = "wincmd =",
})

-- Reload config on save
autocmd("BufWritePost", {
    group = augroup,
    pattern = { ".vimrc", ".vimrc.local", "init.vim" },
    command = "source %",
})

-- Save all files on focus lost
autocmd("FocusLost", {
    group = augroup,
    command = "silent! wa",
})

-- Make quickfix windows take the full lower section
autocmd("FileType", {
    group = augroup,
    pattern = "qf",
    command = "wincmd J",
})

-- Map q to close quickfix
autocmd("FileType", {
    group = augroup,
    pattern = "qf",
    callback = function()
        vim.keymap.set("n", "q", ":q<cr>", { buffer = true, silent = true })
    end,
})
