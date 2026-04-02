--[[
  Autocommands
  ============
  Automatic behaviors triggered by editor events.
]]

local augroup = vim.api.nvim_create_augroup("user_config", { clear = true })
local autocmd = vim.api.nvim_create_autocmd

-- Equalize splits when the window is resized
autocmd("VimResized", {
    group = augroup,
    command = "wincmd =",
})

-- Reload config when saved
autocmd("BufWritePost", {
    group = augroup,
    pattern = { ".vimrc", ".vimrc.local", "init.vim" },
    command = "source %",
})

-- Auto-save all buffers when focus is lost
autocmd("FocusLost", {
    group = augroup,
    command = "silent! wa",
})

-- Quickfix: always full-width at the bottom
autocmd("FileType", {
    group = augroup,
    pattern = "qf",
    command = "wincmd J",
})

-- Quickfix: press q to close
autocmd("FileType", {
    group = augroup,
    pattern = "qf",
    callback = function()
        vim.keymap.set("n", "q", ":q<cr>", { buffer = true, silent = true })
    end,
})
