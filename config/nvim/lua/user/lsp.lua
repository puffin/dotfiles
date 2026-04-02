-- Mason: auto-install LSP servers
require("mason").setup()
require("mason-lspconfig").setup({
    ensure_installed = {
        "ts_ls",
        "pyright",
        "jsonls",
        "terraformls",
        "eslint",
    },
})

-- Diagnostic config
vim.diagnostic.config({
    virtual_text = true,
    signs = true,
    underline = true,
    update_in_insert = false,
    float = { border = "rounded" },
})

-- Diagnostic signs
local signs = { Error = "✖", Warn = "⚠", Hint = "○", Info = "●" }
for type, icon in pairs(signs) do
    local hl = "DiagnosticSign" .. type
    vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = "" })
end

-- Shared capabilities (enhanced by nvim-cmp)
local capabilities = require("cmp_nvim_lsp").default_capabilities()

-- LSP keymaps on attach
vim.api.nvim_create_autocmd("LspAttach", {
    callback = function(args)
        local bufnr = args.buf
        local client = vim.lsp.get_client_by_id(args.data.client_id)
        local map = function(mode, lhs, rhs, desc)
            vim.keymap.set(mode, lhs, rhs, { buffer = bufnr, silent = true, desc = desc })
        end

        map("n", "gd", vim.lsp.buf.definition, "Go to definition")
        map("n", "gy", vim.lsp.buf.type_definition, "Go to type definition")
        map("n", "gi", vim.lsp.buf.implementation, "Go to implementation")
        map("n", "gr", vim.lsp.buf.references, "Find references")
        map("n", "gh", vim.lsp.buf.hover, "Hover info")
        map("n", "K", vim.lsp.buf.hover, "Show documentation")
        map("n", "<leader>rn", vim.lsp.buf.rename, "Rename symbol")
        map("n", "do", vim.lsp.buf.code_action, "Code action")
        map("n", "[c", vim.diagnostic.goto_prev, "Previous diagnostic")
        map("n", "]c", vim.diagnostic.goto_next, "Next diagnostic")
        map("n", "<leader>d", function()
            vim.diagnostic.enable(not vim.diagnostic.is_enabled())
        end, "Toggle diagnostics")

        -- Highlight symbol under cursor
        if client and client.server_capabilities.documentHighlightProvider then
            local hl_group = vim.api.nvim_create_augroup("lsp_highlight_" .. bufnr, { clear = true })
            vim.api.nvim_create_autocmd("CursorHold", {
                group = hl_group,
                buffer = bufnr,
                callback = vim.lsp.buf.document_highlight,
            })
            vim.api.nvim_create_autocmd("CursorMoved", {
                group = hl_group,
                buffer = bufnr,
                callback = vim.lsp.buf.clear_references,
            })
        end

        -- Code lens
        if client and client.server_capabilities.codeLensProvider then
            vim.api.nvim_create_autocmd({ "BufEnter", "InsertLeave" }, {
                buffer = bufnr,
                callback = vim.lsp.codelens.refresh,
            })
        end
    end,
})

-- LSP server configurations using vim.lsp.config (nvim 0.11+)

vim.lsp.config("ts_ls", {
    capabilities = capabilities,
    on_attach = function(client)
        -- Disable ts_ls formatting (we use prettier via conform)
        client.server_capabilities.documentFormattingProvider = false
        client.server_capabilities.documentRangeFormattingProvider = false
    end,
})

vim.lsp.config("eslint", {
    capabilities = capabilities,
})

-- ESLint auto-fix on save
vim.api.nvim_create_autocmd("BufWritePre", {
    callback = function(args)
        local clients = vim.lsp.get_clients({ bufnr = args.buf, name = "eslint" })
        if #clients > 0 then
            vim.cmd("EslintFixAll")
        end
    end,
})

vim.lsp.config("pyright", {
    capabilities = capabilities,
    settings = {
        python = {
            pythonPath = "~/.pyenv/shims/python",
        },
    },
})

vim.lsp.config("jsonls", {
    capabilities = capabilities,
})

vim.lsp.config("terraformls", {
    capabilities = capabilities,
})

-- Enable all configured servers
vim.lsp.enable({ "ts_ls", "eslint", "pyright", "jsonls", "terraformls" })
