'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { vendorOf } = require('../src/shared/vendors');

test('автор библиотеки по папкам', () => {
  assert.strictEqual(vendorOf('E:\\SFX\\Ambient and sounds\\Boom Library - Guns Bundle\\Guns - Construction Kit\\Shot 01.wav'), 'Boom Library');
  assert.strictEqual(vendorOf('E:\\SFX\\BOOM.Library.DOGS.WAV\\Dogs_48kHz_01-02\\Bark.wav'), 'Boom Library');
  assert.strictEqual(vendorOf('E:\\SFX\\Element Series - Water [SoundMorph]\\WAV\\Splash.wav'), 'SoundMorph');
  assert.strictEqual(vendorOf('E:\\SFX\\KROTOS\\Krotos 4 Elements SFX Library WAV\\Fire.wav'), 'Krotos');
  assert.strictEqual(vendorOf('/Users/nick/SFX/Ocular Sounds - Horror Tension/Hit 1.wav'), 'Ocular Sound');
  assert.strictEqual(vendorOf('E:\\SFX\\Foley Pack [Tidal Audio]\\Step.wav'), 'Tidal Audio');
});

test('не путает автора с похожими словами', () => {
  assert.strictEqual(vendorOf('E:\\SFX\\New Pack\\Cinematic (Boom, Impact, Etc...)\\Boom 1.wav'), null);
  assert.strictEqual(vendorOf('E:\\SFX\\Rain [48kHz 24bit]\\Rain.wav'), null);
  assert.strictEqual(vendorOf('E:\\SFX\\Memes\\Diarrhea - sound effect (shitpost).mp3'), null);
  assert.strictEqual(vendorOf('E:\\SFX\\Ambients\\calming-rain-257596.mp3'), 'Pixabay');
});
