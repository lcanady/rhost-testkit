#!/usr/bin/env lua5.4
--[[
  RhostMUSH execscript: string operations via Lua patterns (Lua)

  Lua's pattern matching is far more expressive than MUSH's native matching.

  Usage: execscript(lua_strings.lua, op, |, text, |, arg)
    MUSHQ_0 = operation (see below)
    MUSHQ_1 = input text
    MUSHQ_2 = argument (pattern, replacement, width, etc.)

  Operations:
    upper        MUSHQ_1.upper()
    lower        MUSHQ_1.lower()
    reverse      MUSHQ_1 reversed
    trim         strip leading/trailing whitespace
    len          character count
    words        word count (split on whitespace)
    capitalize   first letter of every word uppercased
    match        return first match of Lua pattern MUSHQ_2 in MUSHQ_1
    gsub         replace all matches of MUSHQ_2 with MUSHQ_3 (reads env MUSHQ_3)
    rep          repeat MUSHQ_1 N times (N = MUSHQ_2)
    padleft      right-align MUSHQ_1 in a field of width MUSHQ_2
    padright     left-align  MUSHQ_1 in a field of width MUSHQ_2
    center       center      MUSHQ_1 in a field of width MUSHQ_2
--]]

local op   = os.getenv("MUSHQ_0") or "len"
local text = os.getenv("MUSHQ_1") or ""
local arg  = os.getenv("MUSHQ_2") or ""
local arg3 = os.getenv("MUSHQ_3") or ""

local result

if op == "upper" then
    result = string.upper(text)

elseif op == "lower" then
    result = string.lower(text)

elseif op == "reverse" then
    result = string.reverse(text)

elseif op == "trim" then
    result = text:match("^%s*(.-)%s*$")

elseif op == "len" then
    result = tostring(#text)

elseif op == "words" then
    local count = 0
    for _ in text:gmatch("%S+") do count = count + 1 end
    result = tostring(count)

elseif op == "capitalize" then
    result = text:gsub("(%a)([%w']*)", function(first, rest)
        return string.upper(first) .. string.lower(rest)
    end)

elseif op == "match" then
    if arg == "" then
        result = "#-1 PATTERN REQUIRED"
    else
        result = text:match(arg) or ""
    end

elseif op == "gsub" then
    -- MUSHQ_2 = pattern, MUSHQ_3 = replacement
    if arg == "" then
        result = "#-1 PATTERN REQUIRED"
    else
        result = text:gsub(arg, arg3)
    end

elseif op == "rep" then
    local n = tonumber(arg) or 1
    result = text:rep(n)

elseif op == "padleft" then
    local w = tonumber(arg) or #text
    result = string.format("%" .. w .. "s", text)

elseif op == "padright" then
    local w = tonumber(arg) or #text
    result = string.format("%-" .. w .. "s", text)

elseif op == "center" then
    local w  = tonumber(arg) or #text
    local pad = math.max(0, w - #text)
    local lpad = math.floor(pad / 2)
    local rpad = pad - lpad
    result = string.rep(" ", lpad) .. text .. string.rep(" ", rpad)

else
    result = "#-1 UNKNOWN OPERATION '" .. op .. "'"
end

io.write(result .. "\n")
