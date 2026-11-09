import { fillMessage, messageError, pickMessage, placeholdersIn } from './reminder-messages.js';

describe('reminder messages', () => {
  it('finds the {words} in a text', () => {
    expect(placeholdersIn('{name}, {drop}?')).toEqual(['name', 'drop']);
    expect(placeholdersIn('No words')).toEqual([]);
  });

  it('allows only the words each reminder can fill', () => {
    expect(messageError('SEARCH_LOCAL', '{name}, {drop}?', 'Drivers are nearby.')).toBeNull();
    expect(messageError('SEARCH_LOCAL', 'Your {time} ride', 'x')).toMatch(/\{time\} can't be used here/);
    expect(messageError('ROUTINE', 'Going to {drop}?', 'Your usual {time} ride. Book {vehicle} now.')).toBeNull();
    expect(messageError('ROUTINE', 'Hi {friend}', 'x')).toMatch(/\{friend\}/);
    expect(messageError('ROUTINE', ' ', 'x')).toBe('Write a title');
    expect(messageError('ROUTINE', 'x'.repeat(66), 'x')).toMatch(/65/);
  });

  it('fills every word, or gives up when one has no value', () => {
    expect(fillMessage('{name}, {drop}?', { name: 'Siva', drop: 'Ooty' })).toBe('Siva, Ooty?');
    expect(fillMessage('{name}, {drop}?', { drop: 'Ooty' })).toBeNull();
    expect(fillMessage('{name}, {drop}?', { name: ' ', drop: 'Ooty' })).toBeNull();
  });

  it('picks at random among the messages that fit', () => {
    const messages = [
      { id: 'a', title: '{name}, {drop}?', body: 'Drivers are nearby.' },
      { id: 'b', title: 'Still going to {drop}?', body: 'Book now.' },
      { id: 'c', title: 'Plans for today?', body: 'A ride is a tap away.' },
    ];
    expect(pickMessage(messages, { name: 'Siva', drop: 'Ooty' }, () => 0)).toEqual({ message: messages[0], title: 'Siva, Ooty?', body: 'Drivers are nearby.' });
    expect(pickMessage(messages, { name: 'Siva', drop: 'Ooty' }, () => 0.99)?.message.id).toBe('c');
    // No name: the {name} message is left out.
    expect(pickMessage(messages, { drop: 'Ooty' }, () => 0)?.message.id).toBe('b');
    expect(pickMessage([messages[0]], { drop: 'Ooty' })).toBeNull();
    expect(pickMessage([], { name: 'Siva' })).toBeNull();
  });
});
