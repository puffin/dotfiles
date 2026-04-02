--[[
  Completion & Snippets
  =====================
  Autocompletion powered by nvim-cmp with LSP, buffer, path, and snippet sources.
  Snippets powered by LuaSnip (loads friendly-snippets + custom snipmate files).
]]

local cmp     = require("cmp")
local luasnip = require("luasnip")

-------------------------------------------------------------------------------
-- Snippet Loaders
-------------------------------------------------------------------------------

-- Load snipmate-format snippets (e.g. UltiSnips/all.snippets, UltiSnips/markdown.snippets)
require("luasnip.loaders.from_snipmate").lazy_load()

-- Load VS Code-style snippets (from friendly-snippets)
require("luasnip.loaders.from_vscode").lazy_load()

-------------------------------------------------------------------------------
-- nvim-cmp Setup
-------------------------------------------------------------------------------
cmp.setup({
    snippet = {
        expand = function(args)
            luasnip.lsp_expand(args.body)
        end,
    },

    window = {
        completion    = cmp.config.window.bordered(),
        documentation = cmp.config.window.bordered(),
    },

    mapping = cmp.mapping.preset.insert({
        -- Tab/S-Tab: cycle completions or jump through snippet placeholders
        ["<Tab>"] = cmp.mapping(function(fallback)
            if cmp.visible() then
                cmp.select_next_item()
            elseif luasnip.expand_or_jumpable() then
                luasnip.expand_or_jump()
            else
                fallback()
            end
        end, { "i", "s" }),

        ["<S-Tab>"] = cmp.mapping(function(fallback)
            if cmp.visible() then
                cmp.select_prev_item()
            elseif luasnip.jumpable(-1) then
                luasnip.jump(-1)
            else
                fallback()
            end
        end, { "i", "s" }),

        ["<C-Space>"] = cmp.mapping.complete(),           -- Trigger completion
        ["<CR>"]      = cmp.mapping.confirm({ select = false }),  -- Confirm selection
        ["<C-e>"]     = cmp.mapping.abort(),               -- Dismiss completion
        ["<C-b>"]     = cmp.mapping.scroll_docs(-4),       -- Scroll docs up
        ["<C-f>"]     = cmp.mapping.scroll_docs(4),        -- Scroll docs down
    }),

    -- Completion sources (ordered by priority)
    sources = cmp.config.sources(
        {
            { name = "nvim_lsp" },   -- LSP
            { name = "luasnip" },    -- Snippets
            { name = "path" },       -- File paths
        },
        {
            { name = "buffer" },     -- Fallback: words from open buffers
        }
    ),
})

-------------------------------------------------------------------------------
-- Snippet Keymaps
-------------------------------------------------------------------------------
local map = vim.keymap.set

map({ "i", "s" }, "<C-l>", function()
    if luasnip.expandable() then luasnip.expand() end
end, { silent = true, desc = "Expand snippet" })

map({ "i", "s" }, "<C-j>", function()
    if luasnip.jumpable(1) then luasnip.jump(1) end
end, { silent = true, desc = "Next snippet placeholder" })

map({ "i", "s" }, "<C-k>", function()
    if luasnip.jumpable(-1) then luasnip.jump(-1) end
end, { silent = true, desc = "Previous snippet placeholder" })

-------------------------------------------------------------------------------
-- Auto-pairs integration (auto-close brackets after confirming a completion)
-------------------------------------------------------------------------------
local cmp_autopairs = require("nvim-autopairs.completion.cmp")
cmp.event:on("confirm_done", cmp_autopairs.on_confirm_done())
