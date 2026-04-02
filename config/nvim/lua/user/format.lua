require("conform").setup({
    formatters_by_ft = {
        javascript = { "prettier" },
        javascriptreact = { "prettier" },
        typescript = { "prettier" },
        typescriptreact = { "prettier" },
        json = { "prettier" },
        html = { "prettier" },
        css = { "prettier" },
        markdown = { "prettier" },
    },
    format_on_save = function(bufnr)
        -- Only format JS/TS files on save (matching old coc behavior)
        local ft = vim.bo[bufnr].filetype
        local auto_format_fts = {
            javascript = true,
            javascriptreact = true,
            typescript = true,
            typescriptreact = true,
        }
        if not auto_format_fts[ft] then
            return nil
        end
        return { timeout_ms = 2000, lsp_format = "fallback" }
    end,
})

-- Manual format with <leader>f
vim.keymap.set("n", "<leader>f", function()
    require("conform").format({ async = true, lsp_format = "fallback" })
end, { desc = "Format file" })
