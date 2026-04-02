--[[
  LSP Configuration
  =================
  Language servers managed by Mason, configured via native vim.lsp.config (nvim 0.11+).
  Keymaps are set globally via LspAttach and apply to any buffer with an active server.
]]

-------------------------------------------------------------------------------
-- Mason: automatic server installation
-------------------------------------------------------------------------------
require("mason").setup()
require("mason-lspconfig").setup({
    ensure_installed = {
        "ts_ls",         -- TypeScript / JavaScript
        "pyright",       -- Python
        "jsonls",        -- JSON
        "terraformls",   -- Terraform
        "eslint",        -- ESLint
    },
})

-------------------------------------------------------------------------------
-- Diagnostics
-------------------------------------------------------------------------------
vim.diagnostic.config({
    virtual_text     = true,
    signs            = true,
    underline        = true,
    update_in_insert = false,
    float            = { border = "rounded" },
})

local signs = { Error = "✖", Warn = "⚠", Hint = "○", Info = "●" }
for type, icon in pairs(signs) do
    local hl = "DiagnosticSign" .. type
    vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = "" })
end

-------------------------------------------------------------------------------
-- Capabilities (enhanced by nvim-cmp for better completion support)
-------------------------------------------------------------------------------
local capabilities = require("cmp_nvim_lsp").default_capabilities()

-------------------------------------------------------------------------------
-- Keymaps (applied to every buffer when an LSP server attaches)
-------------------------------------------------------------------------------
vim.api.nvim_create_autocmd("LspAttach", {
    callback = function(args)
        local bufnr  = args.buf
        local client = vim.lsp.get_client_by_id(args.data.client_id)

        local function map(mode, lhs, rhs, desc)
            vim.keymap.set(mode, lhs, rhs, { buffer = bufnr, silent = true, desc = desc })
        end

        -- Navigation
        map("n", "gd", vim.lsp.buf.definition,      "Go to definition")
        map("n", "gy", vim.lsp.buf.type_definition,  "Go to type definition")
        map("n", "gi", vim.lsp.buf.implementation,   "Go to implementation")
        map("n", "gr", vim.lsp.buf.references,       "Find references")

        -- Information
        map("n", "gh", vim.lsp.buf.hover, "Hover info")
        map("n", "K",  vim.lsp.buf.hover, "Show documentation")

        -- Refactoring
        map("n", "<leader>rn", vim.lsp.buf.rename,      "Rename symbol")
        map("n", "do",         vim.lsp.buf.code_action,  "Code action")

        -- Diagnostics
        map("n", "[c", vim.diagnostic.goto_prev, "Previous diagnostic")
        map("n", "]c", vim.diagnostic.goto_next, "Next diagnostic")
        map("n", "<leader>d", function()
            vim.diagnostic.enable(not vim.diagnostic.is_enabled())
        end, "Toggle diagnostics")

        -- Highlight symbol under cursor
        if client and client.server_capabilities.documentHighlightProvider then
            local hl_group = vim.api.nvim_create_augroup("lsp_highlight_" .. bufnr, { clear = true })
            vim.api.nvim_create_autocmd("CursorHold", {
                group = hl_group, buffer = bufnr,
                callback = vim.lsp.buf.document_highlight,
            })
            vim.api.nvim_create_autocmd("CursorMoved", {
                group = hl_group, buffer = bufnr,
                callback = vim.lsp.buf.clear_references,
            })
        end

        -- Code lens (show inline hints like test runners, implementations count)
        if client and client.server_capabilities.codeLensProvider then
            vim.api.nvim_create_autocmd({ "BufEnter", "InsertLeave" }, {
                buffer = bufnr,
                callback = vim.lsp.codelens.refresh,
            })
        end
    end,
})

-------------------------------------------------------------------------------
-- Server Configurations
-------------------------------------------------------------------------------

-- TypeScript / JavaScript
vim.lsp.config("ts_ls", {
    capabilities = capabilities,
    on_attach = function(client)
        -- Formatting handled by prettier (conform.nvim), not ts_ls
        client.server_capabilities.documentFormattingProvider = false
        client.server_capabilities.documentRangeFormattingProvider = false
    end,
})

-- ESLint
vim.lsp.config("eslint", {
    capabilities = capabilities,
})

-- Auto-fix ESLint issues on save
vim.api.nvim_create_autocmd("BufWritePre", {
    callback = function(args)
        local clients = vim.lsp.get_clients({ bufnr = args.buf, name = "eslint" })
        if #clients > 0 then
            vim.cmd("EslintFixAll")
        end
    end,
})

-- Python
vim.lsp.config("pyright", {
    capabilities = capabilities,
    settings = {
        python = {
            pythonPath = "~/.pyenv/shims/python",
        },
    },
})

-- JSON
vim.lsp.config("jsonls", {
    capabilities = capabilities,
})

-- Terraform
vim.lsp.config("terraformls", {
    capabilities = capabilities,
})

-------------------------------------------------------------------------------
-- Enable all servers
-------------------------------------------------------------------------------
vim.lsp.enable({ "ts_ls", "eslint", "pyright", "jsonls", "terraformls" })
