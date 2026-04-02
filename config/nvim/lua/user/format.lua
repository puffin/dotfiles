--[[
  Code Formatting
  ===============
  Formatting powered by conform.nvim.
  Prettier runs on JS/TS/JSON/HTML/CSS/Markdown.
  Auto-format on save is enabled for JS/TS files only.
]]

require("conform").setup({
    formatters_by_ft = {
        javascript      = { "prettier" },
        javascriptreact = { "prettier" },
        typescript      = { "prettier" },
        typescriptreact = { "prettier" },
        json            = { "prettier" },
        html            = { "prettier" },
        css             = { "prettier" },
        markdown        = { "prettier" },
    },

    -- Auto-format JS/TS on save (other filetypes: manual only)
    format_on_save = function(bufnr)
        local auto_format = {
            javascript      = true,
            javascriptreact = true,
            typescript      = true,
            typescriptreact = true,
        }
        if not auto_format[vim.bo[bufnr].filetype] then
            return nil
        end
        return { timeout_ms = 2000, lsp_format = "fallback" }
    end,
})

-- Manual format: <leader>f (works for any filetype with a configured formatter)
vim.keymap.set("n", "<leader>f", function()
    require("conform").format({ async = true, lsp_format = "fallback" })
end, { desc = "Format file" })
