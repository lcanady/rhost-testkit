#!/usr/bin/env lua5.4
--[[
  RhostMUSH execscript: D&D-style stat-block renderer (Lua)

  Demonstrates complex data processing in Lua called from MUSH softcode.
  Takes a space-separated "STAT:VALUE STAT:VALUE …" list and formats it
  as a compact stat block with computed modifiers.

  Usage: execscript(lua_statblock.lua, stat_list)
    MUSHQ_0 = "STR:16 DEX:14 CON:18 INT:10 WIS:8 CHA:12"

  Returns: multi-line formatted stat block, e.g.
    STR: 16 (+3)  DEX: 14 (+2)  CON: 18 (+4)
    INT: 10 (+0)  WIS:  8 (-1)  CHA: 12 (+1)
--]]

local input = os.getenv("MUSHQ_0") or ""

-- Parse "STAT:VALUE" pairs
local stats = {}
local order = {}
for pair in input:gmatch("%S+") do
    local stat, val = pair:match("^(%a+):(-?%d+)$")
    if stat and val then
        stats[stat] = tonumber(val)
        table.insert(order, stat)
    end
end

if #order == 0 then
    io.write("#-1 NO STATS PROVIDED\n")
    os.exit(0)
end

-- D&D modifier: floor((value - 10) / 2)
local function modifier(val)
    return math.floor((val - 10) / 2)
end

local function mod_str(val)
    local m = modifier(val)
    return m >= 0 and ("+" .. m) or tostring(m)
end

-- Build formatted lines (3 stats per line)
local cols = 3
local lines = {}
local row = {}

for i, stat in ipairs(order) do
    local val = stats[stat]
    local m   = mod_str(val)
    -- "STR: 16 (+3)" padded to 16 chars
    local cell = string.format("%-4s %2d (%3s)", stat .. ":", val, m)
    table.insert(row, cell)
    if #row == cols or i == #order then
        table.insert(lines, table.concat(row, "  "))
        row = {}
    end
end

io.write(table.concat(lines, "\n") .. "\n")
