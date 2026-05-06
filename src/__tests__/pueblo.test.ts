import { convertPueblo, parsePuebloHandshake, generatePuebloHandshake } from '../pueblo';

// ---------------------------------------------------------------------------
// Stream parsing
// ---------------------------------------------------------------------------

describe('convertPueblo() — stream parsing', () => {
    it('plain text with no tags is returned as-is (HTML-escaped)', () => {
        expect(convertPueblo('hello world')).toBe('hello world');
    });

    it('mixed stream: Hello <b>world</b> keeps safe tags', () => {
        expect(convertPueblo('Hello <b>world</b>')).toBe('Hello <b>world</b>');
    });

    it('HTML special chars in plain text are escaped', () => {
        expect(convertPueblo('2 < 3 & 4 > 1')).toBe('2 &lt; 3 &amp; 4 &gt; 1');
    });
});

// ---------------------------------------------------------------------------
// xch_cmd — the key Pueblo feature
// ---------------------------------------------------------------------------

describe('convertPueblo() — xch_cmd', () => {
    it('xch_cmd is moved to data-xch-cmd; href set to #', () => {
        const input = '<a xch_cmd="look here">Examine</a>';
        const output = convertPueblo(input);
        expect(output).toContain('data-xch-cmd="look here"');
        expect(output).toContain('href="#"');
        expect(output).toContain('>Examine</a>');
    });

    it('existing href is kept alongside data-xch-cmd', () => {
        const input = '<a href="http://example.com" xch_cmd="go east">East</a>';
        const output = convertPueblo(input);
        expect(output).toContain('href="http://example.com"');
        expect(output).toContain('data-xch-cmd="go east"');
    });

    it('xch_cmd value is HTML-escaped to prevent injection', () => {
        const input = '<a xch_cmd=\'<script>evil()</script>\'>x</a>';
        const output = convertPueblo(input);
        expect(output).not.toContain('<script>');
        expect(output).toContain('data-xch-cmd=');
    });
});

// ---------------------------------------------------------------------------
// Security / XSS sanitization
// ---------------------------------------------------------------------------

describe('convertPueblo() — XSS sanitization', () => {
    it('<script> tags are stripped entirely', () => {
        const output = convertPueblo('<script>alert(1)</script>');
        expect(output).not.toContain('<script>');
        expect(output).not.toContain('alert(1)');
    });

    it('<iframe> tags are stripped', () => {
        const output = convertPueblo('<iframe src="evil.com">');
        expect(output).not.toContain('<iframe');
    });

    it('on* attributes are removed, tag is kept', () => {
        const output = convertPueblo('<a onclick="evil()">click</a>');
        expect(output).not.toContain('onclick');
        expect(output).toContain('<a');
        expect(output).toContain('click</a>');
    });

    it('onload is removed from <img>, src is kept', () => {
        const output = convertPueblo('<img onload="evil()" src="ok.jpg">');
        expect(output).not.toContain('onload');
        expect(output).toContain('src="ok.jpg"');
    });

    it('javascript: href is stripped', () => {
        const output = convertPueblo('<a href="javascript:evil()">x</a>');
        expect(output).not.toContain('javascript:');
    });

    it('any on* attribute on any tag is removed', () => {
        const output = convertPueblo('<b onmouseover="evil()">bold</b>');
        expect(output).not.toContain('onmouseover');
        expect(output).toContain('<b>');
    });
});

// ---------------------------------------------------------------------------
// Allowed tags (pass-through, sanitized)
// ---------------------------------------------------------------------------

describe('convertPueblo() — allowed tags', () => {
    it('<b>, <i>, <u>, <s> are kept as-is', () => {
        expect(convertPueblo('<b>bold</b>')).toBe('<b>bold</b>');
        expect(convertPueblo('<i>italic</i>')).toBe('<i>italic</i>');
        expect(convertPueblo('<u>under</u>')).toBe('<u>under</u>');
        expect(convertPueblo('<s>strike</s>')).toBe('<s>strike</s>');
    });

    it('<font color="red"> is kept (Pueblo uses font tags)', () => {
        const output = convertPueblo('<font color="red">text</font>');
        expect(output).toContain('<font');
        expect(output).toContain('color="red"');
        expect(output).toContain('text</font>');
    });

    it('<img> is kept with safe attributes only', () => {
        const output = convertPueblo('<img src="img/sword.gif" alt="sword">');
        expect(output).toContain('src="img/sword.gif"');
        expect(output).toContain('alt="sword"');
    });

    it('<a href="http://example.com"> is kept', () => {
        const output = convertPueblo('<a href="http://example.com">link</a>');
        expect(output).toContain('href="http://example.com"');
        expect(output).toContain('link</a>');
    });

    it('<br>, <hr>, <p> are kept', () => {
        expect(convertPueblo('<br>')).toContain('br');
        expect(convertPueblo('<hr>')).toContain('hr');
        expect(convertPueblo('<p>para</p>')).toContain('<p>');
    });

    it('<center> is converted to <div style="text-align:center">', () => {
        const output = convertPueblo('<center>centered</center>');
        expect(output).toContain('text-align:center');
        expect(output).not.toContain('<center>');
    });
});

// ---------------------------------------------------------------------------
// Multimedia
// ---------------------------------------------------------------------------

describe('convertPueblo() — multimedia', () => {
    it('<audio src="..."> gets controls attribute added', () => {
        const output = convertPueblo('<audio src="sound.wav">');
        expect(output).toContain('src="sound.wav"');
        expect(output).toContain('controls');
    });

    it('<bgsound src="..."> is converted to <audio controls loop>', () => {
        const output = convertPueblo('<bgsound src="music.mid">');
        expect(output).toContain('<audio');
        expect(output).toContain('src="music.mid"');
        expect(output).toContain('controls');
        expect(output).toContain('loop');
        expect(output).not.toContain('<bgsound');
    });
});

// ---------------------------------------------------------------------------
// Handshake detection
// ---------------------------------------------------------------------------

describe('Pueblo handshake', () => {
    it('parsePuebloHandshake returns true for a valid Pueblo client string', () => {
        expect(parsePuebloHandshake('PUEBLOCLIENT 1.0.1\r\n...')).toBe(true);
    });

    it('parsePuebloHandshake returns false for non-Pueblo input', () => {
        expect(parsePuebloHandshake('connect Wizard pass\r\n')).toBe(false);
    });

    it('generatePuebloHandshake returns the correct handshake string', () => {
        expect(generatePuebloHandshake()).toBe('PUEBLOCLIENT 1.0.1\r\n');
    });
});
