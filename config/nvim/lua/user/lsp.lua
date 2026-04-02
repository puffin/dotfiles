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
        "yamlls",        -- YAML
        "jsonls",        -- JSON
        "pyright",       -- Python (completions, type checking, hover)
        "ruff",          -- Python (linting, formatting)
    },
})

-------------------------------------------------------------------------------
-- Diagnostics
-------------------------------------------------------------------------------
vim.diagnostic.config({
    virtual_text     = true,           -- Inline error text at end of line
    signs            = true,           -- Signs in the gutter
    underline        = true,           -- Underline the problematic code
    update_in_insert = false,
    float            = {
        border = "rounded",
        source = true,                 -- Show which LSP produced the diagnostic
    },
})

-- Show diagnostics in a float when holding the cursor on a line
vim.api.nvim_create_autocmd("CursorHold", {
    callback = function()
        vim.diagnostic.open_float(nil, { focusable = false })
    end,
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
-- YAML
-------------------------------------------------------------------------------
vim.lsp.config("yamlls", {
    capabilities = capabilities,
    settings = {
        yaml = {
            schemaStore = {
                -- Disable built-in schemaStore, use SchemaStore.nvim instead
                enable = false,
                url = "",
            },
            schemas = require("schemastore").yaml.schemas(),
            validate = true,
            completion = true,
            hover = true,
        },
    },
})

-------------------------------------------------------------------------------
-- JSON
-------------------------------------------------------------------------------
vim.lsp.config("jsonls", {
    capabilities = capabilities,
    settings = {
        json = {
            schemas = require("schemastore").json.schemas(),
            validate = { enable = true },
        },
    },
})

-------------------------------------------------------------------------------
-- Python (pyright: completions + types, ruff: linting + formatting)
-------------------------------------------------------------------------------
vim.lsp.config("pyright", {
    capabilities = capabilities,
    settings = {
        pyright = {
            -- Let ruff handle import sorting
            disableOrganizeImports = true,
        },
        python = {
            analysis = {
                -- Let ruff handle linting diagnostics
                ignore = { "*" },
            },
        },
    },
})

vim.lsp.config("ruff", {
    capabilities = capabilities,
    on_attach = function(client)
        -- Let pyright handle hover
        client.server_capabilities.hoverProvider = false
    end,
})

-------------------------------------------------------------------------------
-- Enable servers
-------------------------------------------------------------------------------
vim.lsp.enable({ "terraformls", "yamlls", "jsonls", "pyright", "ruff" })
