import test from 'node:test';import assert from 'node:assert/strict';import {hashPin,verifyPin,safeRelativePath,isPrivateIp} from '../lib.mjs';
test('PIN hashing and verification',()=>{const h=hashPin('123456');assert.notEqual(h,'123456');assert.equal(verifyPin('123456',h),true);assert.equal(verifyPin('654321',h),false)});
test('safe paths reject traversal',()=>{assert.equal(safeRelativePath('folder/file.txt'),'folder/file.txt');assert.throws(()=>safeRelativePath('../secret'))});
test('private network detection',()=>{assert.equal(isPrivateIp('192.168.1.5'),true);assert.equal(isPrivateIp('172.20.1.2'),true);assert.equal(isPrivateIp('8.8.8.8'),false)});
