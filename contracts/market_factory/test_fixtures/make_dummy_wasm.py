"""Regenerates dummy.wasm, the stand-in Market contract used by MarketFactory unit tests.

The factory deploys this module and then invokes `initialize` with 12 arguments,
expecting `Ok(())` back (a void Val). The module therefore exports a single
`initialize` function taking 12 i64 Vals and returning the void Val (tag 2).

Run: python3 make_dummy_wasm.py   (writes dummy.wasm next to this script)
"""
import os

ARITY = 12
VOID_VAL = 0x02  # soroban Val tag for `()`


def leb_u(n):
    out = bytearray()
    while True:
        byte = n & 0x7F
        n >>= 7
        if n:
            out.append(byte | 0x80)
        else:
            out.append(byte)
            return bytes(out)


def name(s):
    b = s.encode()
    return leb_u(len(b)) + b


def section(sec_id, payload):
    return bytes([sec_id]) + leb_u(len(payload)) + payload


def build():
    i64 = 0x7E
    functype = bytes([0x60]) + leb_u(ARITY) + bytes([i64] * ARITY) + leb_u(1) + bytes([i64])
    types = section(1, leb_u(1) + functype)
    funcs = section(3, leb_u(1) + leb_u(0))
    exports = section(7, leb_u(1) + name("initialize") + bytes([0x00]) + leb_u(0))
    # body: no locals, i64.const VOID_VAL, end
    body = bytes([0x00, 0x42]) + leb_u(VOID_VAL) + bytes([0x0B])
    code = section(10, leb_u(1) + leb_u(len(body)) + body)
    # The host refuses modules without an env-interface metadata section.
    # Payload: ScEnvMetaEntry::InterfaceVersion { protocol: 27, pre_release: 0 }.
    env_meta = bytes.fromhex("0000000000000 01b00000000".replace(" ", ""))
    custom = section(0, name("contractenvmetav0") + env_meta)
    return b"\x00asm\x01\x00\x00\x00" + types + funcs + exports + code + custom


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dummy.wasm")
    with open(out, "wb") as f:
        f.write(build())
    print("wrote", out)
