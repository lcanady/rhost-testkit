#!/usr/bin/env lua5.4
--[[
  RhostMUSH execscript: arithmetic and number formatting (Lua)

  Usage: execscript(lua_calc.lua, op, |, a, |, b)
    MUSHQ_0 = operation: add | sub | mul | div | mod | pow | sqrt | abs | round
    MUSHQ_1 = first operand
    MUSHQ_2 = second operand (ignored for sqrt/abs/round)

  Returns: numeric result or #-1 ERROR MESSAGE
--]]

local op = os.getenv("MUSHQ_0") or "add"
local a  = tonumber(os.getenv("MUSHQ_1") or "0")
local b  = tonumber(os.getenv("MUSHQ_2") or "0")

if not a then io.write("#-1 INVALID ARGUMENT A\n") os.exit(0) end

local result

if     op == "add"   then result = a + b
elseif op == "sub"   then result = a - b
elseif op == "mul"   then result = a * b
elseif op == "div"   then
    if b == 0 then io.write("#-1 DIVISION BY ZERO\n") os.exit(0) end
    result = a / b
elseif op == "mod"   then
    if b == 0 then io.write("#-1 DIVISION BY ZERO\n") os.exit(0) end
    result = a % b
elseif op == "pow"   then result = a ^ b
elseif op == "sqrt"  then
    if a < 0 then io.write("#-1 SQRT OF NEGATIVE\n") os.exit(0) end
    result = math.sqrt(a)
elseif op == "abs"   then result = math.abs(a)
elseif op == "round" then result = math.floor(a + 0.5)
elseif op == "floor" then result = math.floor(a)
elseif op == "ceil"  then result = math.ceil(a)
else
    io.write("#-1 UNKNOWN OPERATION '" .. op .. "'\n")
    os.exit(0)
end

-- Output as integer if the result is a whole number
if result == math.floor(result) then
    io.write(string.format("%d\n", result))
else
    io.write(string.format("%g\n", result))
end
