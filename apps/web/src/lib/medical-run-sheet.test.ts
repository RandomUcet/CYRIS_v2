import assert from 'node:assert/strict';
import {test} from 'node:test';
import type {MedicalEncounterItem} from '@cyris/contracts';
import {filterMedicalRunSheet, parseMedicalRunSheetView} from './medical-run-sheet.js';

const fixtures = [
  {medicalNumber: 'MED-0001', status: 'RECEIVED', triageCategory: 'MINOR', chiefComplaint: 'Headache', personDisplayName: 'Alice', assignedUnitName: 'Red'},
  {medicalNumber: 'MED-0002', status: 'TRIAGED', triageCategory: 'DELAYED', chiefComplaint: 'Burn', personDisplayName: 'Bob', assignedUnitName: 'Blue'},
  {medicalNumber: 'MED-0003', status: 'TRANSFERRED', triageCategory: 'IMMEDIATE', transferredAt: '2026-11-22T20:00:00Z', chiefComplaint: 'Fracture', personDisplayName: 'Cora', assignedUnitName: 'Red'},
  {medicalNumber: 'MED-0004', status: 'CLOSED', triageCategory: 'UNKNOWN', chiefComplaint: 'Recovered', personDisplayName: 'Dan', assignedUnitName: 'Blue'},
] as MedicalEncounterItem[];

test('medical run-sheet filters match active, triage, transfer and full workspace views', () => {
  assert.deepEqual(filterMedicalRunSheet(fixtures,{view:'active'}).map(x=>x.medicalNumber), ['MED-0001','MED-0002']);
  assert.deepEqual(filterMedicalRunSheet(fixtures,{view:'triage'}).map(x=>x.medicalNumber), ['MED-0002','MED-0003']);
  assert.deepEqual(filterMedicalRunSheet(fixtures,{view:'transfers'}).map(x=>x.medicalNumber), ['MED-0003']);
  assert.equal(filterMedicalRunSheet(fixtures,{view:'all'}).length, 4);
  assert.equal(parseMedicalRunSheetView('bogus'), 'active');
  assert.equal(parseMedicalRunSheetView('all'), 'all');
});

test('print and screen filters preserve triage and case-insensitive text search', () => {
  assert.deepEqual(filterMedicalRunSheet(fixtures,{view:'all',triage:'MINOR',search:'RED'}).map(x=>x.medicalNumber),['MED-0001']);
  assert.deepEqual(filterMedicalRunSheet(fixtures,{view:'all',search:'MED-0002'}).map(x=>x.medicalNumber),['MED-0002']);
  assert.equal(filterMedicalRunSheet(fixtures,{view:'all',search:'not in result'}).length,0);
});
