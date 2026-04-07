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

-- Reload files changed outside of neovim and refresh LSP
autocmd("FocusGained", {
    group = augroup,
    callback = function()
        vim.cmd("silent! checktime")
        -- Re-edit only buffers whose files changed on disk
        for _, buf in ipairs(vim.api.nvim_list_bufs()) do
            if vim.api.nvim_buf_is_loaded(buf) and vim.bo[buf].buflisted then
                local name = vim.api.nvim_buf_get_name(buf)
                if name ~= "" then
                    local disk_mtime = vim.fn.getftime(name)
                    local buf_changedtick = vim.b[buf]._last_disk_mtime or 0
                    if disk_mtime > buf_changedtick then
                        vim.b[buf]._last_disk_mtime = disk_mtime
                        vim.api.nvim_buf_call(buf, function()
                            vim.cmd("silent! e")
                        end)
                    end
                end
            end
        end
    end,
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
