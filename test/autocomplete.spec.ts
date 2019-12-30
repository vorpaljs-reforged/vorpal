import Vorpal from '../src/vorpal';

describe('session._autocomplete', function() {
  let vorpal;
  beforeAll(function() {
    vorpal = new Vorpal();
  });
  it('should return longest possible match', function() {
    const result = vorpal.session._autocomplete('c', ['cmd', 'cme', 'def']);
    expect(result).toBe('cm');
  });

  it('should return list of matches when there are no more common characters', function() {
    const result = vorpal.session._autocomplete('c', ['cmd', 'ced']);
    expect(result.length).toBe(2);
    expect(result[0]).toBe('ced');
    expect(result[1]).toBe('cmd');
  });

  it('should return list of matches even if we have a complete match', function() {
    const result = vorpal.session._autocomplete('cmd', ['cmd', 'cmd2']);
    expect(result.length).toBe(2);
    expect(result[0]).toBe('cmd');
    expect(result[1]).toBe('cmd2');
  });

  it('should return undefined if no match', function() {
    const result = vorpal.session._autocomplete('cmd', ['def', 'xyz']);
    expect(result).toBe(undefined);
  });

  it('should return the match if only a single possible match exists', function() {
    const result = vorpal.session._autocomplete('d', ['def', 'xyz']);
    expect(result).toBe('def ');
  });

  it('should return the prefix along with the partial match when supplied with a prefix input', function() {
    const result = vorpal.session._autocomplete('foo/de', [
      'dally',
      'definitive',
      'definitop',
      'bob',
    ]);
    expect(result).toBe('foo/definit');
  });

  it('should return a list of matches when supplied with a prefix but no value post prefix', function() {
    const result = vorpal.session._autocomplete('foo/', [
      'dally',
      'definitive',
      'definitop',
      'bob',
    ]);
    expect(result.length).toBe(4);
    expect(result[0]).toBe('bob');
    expect(result[1]).toBe('dally');
    expect(result[2]).toBe('definitive');
    expect(result[3]).toBe('definitop');
  });
});
