local cmp = require("cmp")
local luasnip = require("luasnip")

-- Load UltiSnips-format snippets (your existing custom snippets)
require("luasnip.loaders.from_snipmate").lazy_load()
require("luasnip.loaders.from_vscode").lazy_load()

-- nvim-cmp setup
cmp.setup({
    snippet = {
        expand = function(args)
            luasnip.lsp_expand(args.body)
        end,
    },
    window = {
        completion = cmp.config.window.bordered(),
        documentation = cmp.config.window.bordered(),
    },
    mapping = cmp.mapping.preset.insert({
        -- Tab / S-Tab: navigate completion or jump snippets
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

        -- C-space: trigger completion
        ["<C-Space>"] = cmp.mapping.complete(),

        -- CR: confirm selection
        ["<CR>"] = cmp.mapping.confirm({ select = false }),

        -- C-e: abort completion
        ["<C-e>"] = cmp.mapping.abort(),

        -- Scroll docs
        ["<C-b>"] = cmp.mapping.scroll_docs(-4),
        ["<C-f>"] = cmp.mapping.scroll_docs(4),
    }),
    sources = cmp.config.sources({
        { name = "nvim_lsp" },
        { name = "luasnip" },
        { name = "path" },
    }, {
        { name = "buffer" },
    }),
})

-- Snippet keymaps (matching old CoC bindings)
vim.keymap.set({ "i", "s" }, "<C-l>", function()
    if luasnip.expandable() then
        luasnip.expand()
    end
end, { silent = true, desc = "Expand snippet" })

vim.keymap.set({ "i", "s" }, "<C-j>", function()
    if luasnip.jumpable(1) then
        luasnip.jump(1)
    end
end, { silent = true, desc = "Snippet jump next" })

vim.keymap.set({ "i", "s" }, "<C-k>", function()
    if luasnip.jumpable(-1) then
        luasnip.jump(-1)
    end
end, { silent = true, desc = "Snippet jump prev" })

-- nvim-autopairs integration with cmp
local cmp_autopairs = require("nvim-autopairs.completion.cmp")
cmp.event:on("confirm_done", cmp_autopairs.on_confirm_done())
