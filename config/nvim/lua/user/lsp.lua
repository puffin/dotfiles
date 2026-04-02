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
        "terraformls",   -- Terraform
    },
})

-------------------------------------------------------------------------------
-- Capabilities (enhanced by blink.cmp for better completion support)
-------------------------------------------------------------------------------
local capabilities = require("blink.cmp").get_lsp_capabilities()

-------------------------------------------------------------------------------
-- Keymaps (applied to every buffer when an LSP server attaches)
-------------------------------------------------------------------------------
vim.api.nvim_create_autocmd("LspAttach", {
    callback = function(args)
        local bufnr = args.buf

        local function map(mode, lhs, rhs, desc)
            vim.keymap.set(mode, lhs, rhs, { buffer = bufnr, silent = true, desc = desc })
        end

        map("n", "gd", vim.lsp.buf.definition,     "Go to definition")
        map("n", "gy", vim.lsp.buf.type_definition, "Go to type definition")
        map("n", "gi", vim.lsp.buf.implementation,  "Go to implementation")
        map("n", "gr", vim.lsp.buf.references,      "Find references")
        map("n", "K",  vim.lsp.buf.hover,           "Show documentation")
        map("n", "<leader>rn", vim.lsp.buf.rename,      "Rename symbol")
        map("n", "<leader>ca", vim.lsp.buf.code_action,  "Code action")
    end,
})

-------------------------------------------------------------------------------
-- Terraform
-------------------------------------------------------------------------------
vim.lsp.config("terraformls", {
    capabilities = capabilities,
    init_options = {
        experimentalFeatures = {
            prefillRequiredFields = true,
        },
    },
})

-------------------------------------------------------------------------------
-- Enable servers
-------------------------------------------------------------------------------
vim.lsp.enable({ "terraformls" })
