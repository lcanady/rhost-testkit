import { parseDocument, loadFiles } from '../../offline/document';
import { OfflineExpect, OfflineExpectError } from '../../offline/expect';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const FINGER = `
&CMD_FINGER obj=$finger *:@pemit %#=[u(FN_FINGER,%0)]
&FN_FINGER obj=[if(not(%0),#-1 MISSING ARG,name(%0))]
&HELP_FINGER obj=Usage: finger <player>
`.trim();

const BROKEN = `&CMD_BAD obj=$bad *:@pemit %#=[add(1,2`;

describe('parseDocument', () => {
  it('extracts attributes correctly', () => {
    const doc = parseDocument(FINGER);
    expect(doc.attrs).toHaveLength(3);
    expect(doc.attrs[0].name).toBe('CMD_FINGER');
    expect(doc.attrs[1].name).toBe('FN_FINGER');
  });

  it('marks inline source filename', () => {
    const doc = parseDocument(FINGER);
    expect(doc.filename).toBe('<inline>');
  });
});

describe('OfflineExpect.hasAttribute', () => {
  it('passes when attribute is present', () => {
    const doc = parseDocument(FINGER);
    expect(() => new OfflineExpect(doc).hasAttribute('CMD_FINGER')).not.toThrow();
  });

  it('fails when attribute is missing', () => {
    const doc = parseDocument(FINGER);
    expect(() => new OfflineExpect(doc).hasAttribute('CMD_MISSING')).toThrow(OfflineExpectError);
  });

  it('passes .not when attribute is absent', () => {
    const doc = parseDocument(FINGER);
    expect(() => new OfflineExpect(doc).not.hasAttribute('CMD_MISSING')).not.toThrow();
  });
});

describe('OfflineExpect.attributeCount', () => {
  it('passes with exact count', () => {
    const doc = parseDocument(FINGER);
    expect(() => new OfflineExpect(doc).attributeCount(3)).not.toThrow();
  });

  it('fails with wrong count', () => {
    const doc = parseDocument(FINGER);
    expect(() => new OfflineExpect(doc).attributeCount(99)).toThrow(OfflineExpectError);
  });
});

describe('OfflineExpect.hasFunction', () => {
  it('finds add() in attribute body', () => {
    const doc = parseDocument(FINGER);
    expect(() => new OfflineExpect(doc).hasFunction('u')).not.toThrow();
  });

  it('fails when function not present', () => {
    const doc = parseDocument(FINGER);
    expect(() => new OfflineExpect(doc).hasFunction('encode64')).toThrow(OfflineExpectError);
  });
});

describe('OfflineExpect.noLintErrors', () => {
  it('passes on clean code', () => {
    const doc = parseDocument(FINGER);
    expect(() => new OfflineExpect(doc).noLintErrors()).not.toThrow();
  });
});

describe('OfflineExpect.maxAttributeLength', () => {
  it('passes when all attrs are short', () => {
    const doc = parseDocument(FINGER);
    expect(() => new OfflineExpect(doc).maxAttributeLength(7500)).not.toThrow();
  });

  it('fails when an attr exceeds the limit', () => {
    const long = `&CMD_LONG obj=$x:` + 'a'.repeat(200);
    const doc = parseDocument(long);
    expect(() => new OfflineExpect(doc).maxAttributeLength(100)).toThrow(OfflineExpectError);
  });
});

describe('OfflineExpect.noClobber', () => {
  it('passes on code with no setq in loops', () => {
    const doc = parseDocument(FINGER);
    expect(() => new OfflineExpect(doc).noClobber()).not.toThrow();
  });

  it('flags setq inside iter without localize', () => {
    const clobber = `&ATTR obj=[iter(lnum(1,5),[setq(0,##)])]`;
    const doc = parseDocument(clobber);
    // The W006 diagnostic should appear (validator path uses its own parser)
    expect(() => new OfflineExpect(doc).noClobber()).toThrow(OfflineExpectError);
  });
});

describe('loadFiles', () => {
  it('loads multiple temp files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rhost-offline-'));
    fs.writeFileSync(path.join(dir, 'a.mush'), FINGER);
    fs.writeFileSync(path.join(dir, 'b.mush'), `&CONF_VERSION obj=1.0.0`);

    const docs = loadFiles([
      path.join(dir, 'a.mush'),
      path.join(dir, 'b.mush'),
    ]);
    expect(docs).toHaveLength(2);
    expect(docs[0].attrs[0].name).toBe('CMD_FINGER');
    expect(docs[1].attrs[0].name).toBe('CONF_VERSION');

    fs.rmSync(dir, { recursive: true });
  });
});
