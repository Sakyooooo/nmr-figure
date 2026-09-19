// Fulmer, G. R. et al. "NMR Chemical Shifts of Trace Impurities: Common Laboratory Solvents,
// Organics, and Gases in Deuterated Solvents Relevant to the Organometallic Chemist."
// Organometallics 2010, 29, 2176-2179. DOI: 10.1021/om100106e
// Values transcribed from Tables 1 (1H) and 2 (13C). A [lo, hi] pair is a range given in the table.
import type { ImpurityCompound, SolventKey } from '../lib/impurityTypes';

/** Residual solvent signals. The first entry is the reference signal. */
export const RESIDUAL_1H: Partial<Record<SolventKey, number[]>> = {
  "THF-d8": [1.72, 3.58],
  "CD2Cl2": [5.32],
  "CDCl3": [7.26],
  "toluene-d8": [2.08, 6.97, 7.01, 7.09],
  "C6D6": [7.16],
  "C6D5Cl": [6.96, 6.99, 7.14],
  "acetone-d6": [2.05],
  "DMSO-d6": [2.5],
  "CD3CN": [1.94],
  "TFE-d3": [5.02, 3.88],
  "CD3OD": [3.31],
  "D2O": [4.79],
};

export const RESIDUAL_13C: Partial<Record<SolventKey, number[]>> = {
  "THF-d8": [67.21, 25.31],
  "CD2Cl2": [53.84],
  "CDCl3": [77.16],
  "toluene-d8": [137.48, 128.87, 127.96, 125.13, 20.43],
  "C6D6": [128.06],
  "C6D5Cl": [134.19, 129.26, 128.25, 125.96],
  "acetone-d6": [29.84, 206.26],
  "DMSO-d6": [39.52],
  "CD3CN": [1.32, 118.26],
  "TFE-d3": [61.5, 126.28],
  "CD3OD": [49.0],
};

export const IMPURITIES_1H: ImpurityCompound[] = [
  { id: "water", name: "H_{2}O", signals: [
    { group: "OH", mult: "s", broad: true, shifts: { "THF-d8": 2.46, "CD2Cl2": 1.52, "CDCl3": 1.56, "toluene-d8": 0.43, "C6D6": 0.4, "C6D5Cl": 1.03, "acetone-d6": 2.84, "DMSO-d6": 3.33, "CD3CN": 2.13, "TFE-d3": 3.66, "CD3OD": 4.87 } },
  ] },
  { id: "acetic-acid", name: "AcOH", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 1.89, "CD2Cl2": 2.06, "CDCl3": 2.1, "toluene-d8": 1.57, "C6D6": 1.52, "C6D5Cl": 1.76, "acetone-d6": 1.96, "DMSO-d6": 1.91, "CD3CN": 1.96, "TFE-d3": 2.06, "CD3OD": 1.99, "D2O": 2.08 } },
  ] },
  { id: "acetone", name: "Acetone", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 2.05, "CD2Cl2": 2.12, "CDCl3": 2.17, "toluene-d8": 1.57, "C6D6": 1.55, "C6D5Cl": 1.77, "acetone-d6": 2.09, "DMSO-d6": 2.09, "CD3CN": 2.08, "TFE-d3": 2.19, "CD3OD": 2.15, "D2O": 2.22 } },
  ] },
  { id: "acetonitrile", name: "MeCN", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 1.95, "CD2Cl2": 1.97, "CDCl3": 2.1, "toluene-d8": 0.69, "C6D6": 0.58, "C6D5Cl": 1.21, "acetone-d6": 2.05, "DMSO-d6": 2.07, "CD3CN": 1.96, "TFE-d3": 1.95, "CD3OD": 2.03, "D2O": 2.06 } },
  ] },
  { id: "benzene", name: "Benzene", signals: [
    { group: "CH", mult: "s", shifts: { "THF-d8": 7.31, "CD2Cl2": 7.35, "CDCl3": 7.36, "toluene-d8": 7.12, "C6D6": 7.15, "C6D5Cl": 7.2, "acetone-d6": 7.36, "DMSO-d6": 7.37, "CD3CN": 7.37, "TFE-d3": 7.36, "CD3OD": 7.33 } },
  ] },
  { id: "tbuoh", name: "^{t}BuOH", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 1.15, "CD2Cl2": 1.24, "CDCl3": 1.28, "toluene-d8": 1.03, "C6D6": 1.05, "C6D5Cl": 1.12, "acetone-d6": 1.18, "DMSO-d6": 1.11, "CD3CN": 1.16, "TFE-d3": 1.28, "CD3OD": 1.4, "D2O": 1.24 } },
    { group: "OH", mult: "s", broad: true, shifts: { "THF-d8": 3.16, "toluene-d8": 0.58, "C6D6": 0.63, "C6D5Cl": 1.3, "DMSO-d6": 4.19, "CD3CN": 2.18, "TFE-d3": 2.2 } },
  ] },
  { id: "chloroform", name: "CHCl_{3}", signals: [
    { group: "CH", mult: "s", shifts: { "THF-d8": 7.89, "CD2Cl2": 7.32, "CDCl3": 7.26, "toluene-d8": 6.1, "C6D6": 6.15, "C6D5Cl": 6.74, "acetone-d6": 8.02, "DMSO-d6": 8.32, "CD3CN": 7.58, "TFE-d3": 7.33, "CD3OD": 7.9 } },
  ] },
  { id: "18-crown-6", name: "18-Crown-6", signals: [
    { group: "CH2", mult: "s", shifts: { "THF-d8": 3.57, "CD2Cl2": 3.59, "CDCl3": 3.67, "toluene-d8": 3.36, "C6D6": 3.39, "C6D5Cl": 3.41, "acetone-d6": 3.59, "DMSO-d6": 3.51, "CD3CN": 3.51, "TFE-d3": 3.64, "CD3OD": 3.64, "D2O": 3.8 } },
  ] },
  { id: "cyclohexane", name: "Cyclohexane", signals: [
    { group: "CH2", mult: "s", shifts: { "THF-d8": 1.44, "CD2Cl2": 1.44, "CDCl3": 1.43, "toluene-d8": 1.4, "C6D6": 1.4, "C6D5Cl": 1.37, "acetone-d6": 1.43, "DMSO-d6": 1.4, "CD3CN": 1.44, "TFE-d3": 1.47, "CD3OD": 1.45 } },
  ] },
  { id: "dce", name: "1,2-DCE", signals: [
    { group: "CH2", mult: "s", shifts: { "THF-d8": 3.77, "CD2Cl2": 3.76, "CDCl3": 3.73, "toluene-d8": 2.91, "C6D6": 2.9, "C6D5Cl": 3.26, "acetone-d6": 3.87, "DMSO-d6": 3.9, "CD3CN": 3.81, "TFE-d3": 3.71, "CD3OD": 3.78 } },
  ] },
  { id: "dichloromethane", name: "CH_{2}Cl_{2}", signals: [
    { group: "CH2", mult: "s", shifts: { "THF-d8": 5.51, "CD2Cl2": 5.33, "CDCl3": 5.3, "toluene-d8": 4.32, "C6D6": 4.27, "C6D5Cl": 4.77, "acetone-d6": 5.63, "DMSO-d6": 5.76, "CD3CN": 5.44, "TFE-d3": 5.24, "CD3OD": 5.49 } },
  ] },
  { id: "diethyl-ether", name: "Et_{2}O", signals: [
    { group: "CH3", mult: "t, 7", shifts: { "THF-d8": 1.12, "CD2Cl2": 1.15, "CDCl3": 1.21, "toluene-d8": 1.1, "C6D6": 1.11, "C6D5Cl": 1.1, "acetone-d6": 1.11, "DMSO-d6": 1.09, "CD3CN": 1.12, "TFE-d3": 1.2, "CD3OD": 1.18, "D2O": 1.17 } },
    { group: "CH2", mult: "q, 7", shifts: { "THF-d8": 3.38, "CD2Cl2": 3.43, "CDCl3": 3.48, "toluene-d8": 3.25, "C6D6": 3.26, "C6D5Cl": 3.31, "acetone-d6": 3.41, "DMSO-d6": 3.38, "CD3CN": 3.42, "TFE-d3": 3.58, "CD3OD": 3.49, "D2O": 3.56 } },
  ] },
  { id: "diglyme", name: "Diglyme", signals: [
    { group: "CH2", mult: "m", shifts: { "THF-d8": 3.43, "CD2Cl2": 3.57, "CDCl3": 3.65, "toluene-d8": 3.43, "C6D6": 3.46, "C6D5Cl": 3.49, "acetone-d6": 3.56, "DMSO-d6": 3.51, "CD3CN": 3.53, "TFE-d3": 3.67, "CD3OD": 3.61, "D2O": 3.67 } },
    { group: "CH2", mult: "m", shifts: { "THF-d8": 3.53, "CD2Cl2": 3.5, "CDCl3": 3.57, "toluene-d8": 3.31, "C6D6": 3.34, "C6D5Cl": 3.37, "acetone-d6": 3.47, "DMSO-d6": 3.38, "CD3CN": 3.45, "TFE-d3": 3.62, "CD3OD": 3.58, "D2O": 3.61 } },
    { group: "OCH3", mult: "s", shifts: { "THF-d8": 3.28, "CD2Cl2": 3.33, "CDCl3": 3.39, "toluene-d8": 3.12, "C6D6": 3.11, "C6D5Cl": 3.16, "acetone-d6": 3.28, "DMSO-d6": 3.24, "CD3CN": 3.29, "TFE-d3": 3.41, "CD3OD": 3.35, "D2O": 3.37 } },
  ] },
  { id: "dmf", name: "DMF", signals: [
    { group: "CH", mult: "s", shifts: { "THF-d8": 7.91, "CD2Cl2": 7.96, "CDCl3": 8.02, "toluene-d8": 7.57, "C6D6": 7.63, "C6D5Cl": 7.73, "acetone-d6": 7.96, "DMSO-d6": 7.95, "CD3CN": 7.92, "TFE-d3": 7.86, "CD3OD": 7.97, "D2O": 7.92 } },
    { group: "CH3", mult: "s", shifts: { "THF-d8": 2.88, "CD2Cl2": 2.91, "CDCl3": 2.96, "toluene-d8": 2.37, "C6D6": 2.36, "C6D5Cl": 2.51, "acetone-d6": 2.94, "DMSO-d6": 2.89, "CD3CN": 2.89, "TFE-d3": 2.98, "CD3OD": 2.99, "D2O": 3.01 } },
    { group: "CH3", mult: "s", shifts: { "THF-d8": 2.76, "CD2Cl2": 2.82, "CDCl3": 2.88, "toluene-d8": 1.96, "C6D6": 1.86, "C6D5Cl": 2.3, "acetone-d6": 2.78, "DMSO-d6": 2.73, "CD3CN": 2.77, "TFE-d3": 2.88, "CD3OD": 2.86, "D2O": 2.85 } },
  ] },
  { id: "dioxane", name: "1,4-Dioxane", signals: [
    { group: "CH2", mult: "s", shifts: { "THF-d8": 3.56, "CD2Cl2": 3.65, "CDCl3": 3.71, "toluene-d8": 3.33, "C6D6": 3.35, "C6D5Cl": 3.45, "acetone-d6": 3.59, "DMSO-d6": 3.57, "CD3CN": 3.6, "TFE-d3": 3.76, "CD3OD": 3.66, "D2O": 3.75 } },
  ] },
  { id: "dme", name: "DME", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 3.28, "CD2Cl2": 3.34, "CDCl3": 3.4, "toluene-d8": 3.12, "C6D6": 3.12, "C6D5Cl": 3.17, "acetone-d6": 3.28, "DMSO-d6": 3.24, "CD3CN": 3.28, "TFE-d3": 3.4, "CD3OD": 3.35, "D2O": 3.37 } },
    { group: "CH2", mult: "s", shifts: { "THF-d8": 3.43, "CD2Cl2": 3.49, "CDCl3": 3.55, "toluene-d8": 3.31, "C6D6": 3.33, "C6D5Cl": 3.37, "acetone-d6": 3.46, "DMSO-d6": 3.43, "CD3CN": 3.45, "TFE-d3": 3.61, "CD3OD": 3.52, "D2O": 3.6 } },
  ] },
  { id: "ethane", name: "Ethane", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 0.85, "CD2Cl2": 0.85, "CDCl3": 0.87, "toluene-d8": 0.81, "C6D6": 0.8, "C6D5Cl": 0.79, "acetone-d6": 0.83, "DMSO-d6": 0.82, "CD3CN": 0.85, "TFE-d3": 0.85, "CD3OD": 0.85, "D2O": 0.82 } },
  ] },
  { id: "ethanol", name: "EtOH", signals: [
    { group: "CH3", mult: "t, 7", shifts: { "THF-d8": 1.1, "CD2Cl2": 1.19, "CDCl3": 1.25, "toluene-d8": 0.97, "C6D6": 0.96, "C6D5Cl": 1.06, "acetone-d6": 1.12, "DMSO-d6": 1.06, "CD3CN": 1.12, "TFE-d3": 1.22, "CD3OD": 1.19, "D2O": 1.17 } },
    { group: "CH2", mult: "q, 7", shifts: { "THF-d8": 3.51, "CD2Cl2": 3.66, "CDCl3": 3.72, "toluene-d8": 3.36, "C6D6": 3.34, "C6D5Cl": 3.51, "acetone-d6": 3.57, "DMSO-d6": 3.44, "CD3CN": 3.54, "TFE-d3": 3.71, "CD3OD": 3.6, "D2O": 3.65 } },
    { group: "OH", mult: "s", broad: true, shifts: { "THF-d8": 3.3, "CD2Cl2": 1.33, "CDCl3": 1.32, "toluene-d8": 0.83, "C6D6": 0.5, "C6D5Cl": 1.39, "acetone-d6": 3.39, "DMSO-d6": 4.63, "CD3CN": 2.47 } },
  ] },
  { id: "ethyl-acetate", name: "EtOAc", signals: [
    { group: "CH3CO", mult: "s", shifts: { "THF-d8": 1.94, "CD2Cl2": 2.0, "CDCl3": 2.05, "toluene-d8": 1.69, "C6D6": 1.65, "C6D5Cl": 1.78, "acetone-d6": 1.97, "DMSO-d6": 1.99, "CD3CN": 1.97, "TFE-d3": 2.03, "CD3OD": 2.01, "D2O": 2.07 } },
    { group: "CH2", mult: "q, 7", shifts: { "THF-d8": 4.04, "CD2Cl2": 4.08, "CDCl3": 4.12, "toluene-d8": 3.87, "C6D6": 3.89, "C6D5Cl": 3.96, "acetone-d6": 4.05, "DMSO-d6": 4.03, "CD3CN": 4.06, "TFE-d3": 4.14, "CD3OD": 4.09, "D2O": 4.14 } },
    { group: "CH3", mult: "t, 7", shifts: { "THF-d8": 1.19, "CD2Cl2": 1.23, "CDCl3": 1.26, "toluene-d8": 0.94, "C6D6": 0.92, "C6D5Cl": 1.04, "acetone-d6": 1.2, "DMSO-d6": 1.17, "CD3CN": 1.2, "TFE-d3": 1.26, "CD3OD": 1.24, "D2O": 1.24 } },
  ] },
  { id: "ethylene", name: "Ethylene", signals: [
    { group: "CH2", mult: "s", shifts: { "THF-d8": 5.36, "CD2Cl2": 5.4, "CDCl3": 5.4, "toluene-d8": 5.25, "C6D6": 5.25, "C6D5Cl": 5.29, "acetone-d6": 5.38, "DMSO-d6": 5.41, "CD3CN": 5.41, "TFE-d3": 5.4, "CD3OD": 5.39, "D2O": 5.44 } },
  ] },
  { id: "ethylene-glycol", name: "Ethylene glycol", signals: [
    { group: "CH2", mult: "s", shifts: { "THF-d8": 3.48, "CD2Cl2": 3.66, "CDCl3": 3.76, "toluene-d8": 3.36, "C6D6": 3.41, "C6D5Cl": 3.58, "acetone-d6": 3.28, "DMSO-d6": 3.34, "CD3CN": 3.51, "TFE-d3": 3.72, "CD3OD": 3.59, "D2O": 3.65 } },
  ] },
  { id: "grease", name: "Grease", signals: [
    { group: "CH3", mult: "m", shifts: { "THF-d8": [0.85, 0.91], "CD2Cl2": [0.84, 0.9], "CDCl3": [0.84, 0.87], "toluene-d8": [0.89, 0.96], "C6D6": [0.9, 0.98], "C6D5Cl": [0.86, 0.92], "acetone-d6": 0.9, "DMSO-d6": [0.82, 0.88], "TFE-d3": [0.88, 0.94], "CD3OD": [0.86, 0.93] } },
    { group: "CH2", mult: "br s", shifts: { "THF-d8": 1.29, "CD2Cl2": 1.27, "CDCl3": 1.25, "toluene-d8": 1.33, "C6D6": 1.32, "C6D5Cl": 1.3, "acetone-d6": 1.29, "DMSO-d6": 1.24, "TFE-d3": 1.33, "CD3OD": 1.29 } },
  ] },
  { id: "hexamethylbenzene", name: "C_{6}Me_{6}", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 2.18, "CD2Cl2": 2.2, "CDCl3": 2.24, "toluene-d8": 2.1, "C6D6": 2.13, "C6D5Cl": 2.1, "acetone-d6": 2.17, "DMSO-d6": 2.14, "CD3CN": 2.19, "TFE-d3": 2.24, "CD3OD": 2.19 } },
  ] },
  { id: "hexane", name: "Hexane", signals: [
    { group: "CH3", mult: "t, 7", shifts: { "THF-d8": 0.89, "CD2Cl2": 0.89, "CDCl3": 0.88, "toluene-d8": 0.88, "C6D6": 0.89, "C6D5Cl": 0.85, "acetone-d6": 0.88, "DMSO-d6": 0.86, "CD3CN": 0.89, "TFE-d3": 0.91, "CD3OD": 0.9 } },
    { group: "CH2", mult: "m", shifts: { "THF-d8": 1.29, "CD2Cl2": 1.27, "CDCl3": 1.26, "toluene-d8": 1.22, "C6D6": 1.24, "C6D5Cl": 1.19, "acetone-d6": 1.28, "DMSO-d6": 1.25, "CD3CN": 1.28, "TFE-d3": 1.31, "CD3OD": 1.29 } },
  ] },
  { id: "hmdso", name: "HMDSO", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 0.07, "CD2Cl2": 0.07, "CDCl3": 0.07, "toluene-d8": 0.1, "C6D6": 0.12, "C6D5Cl": 0.1, "acetone-d6": 0.07, "DMSO-d6": 0.06, "CD3CN": 0.07, "TFE-d3": 0.08, "CD3OD": 0.07, "D2O": 0.28 } },
  ] },
  { id: "hmpa", name: "HMPA", signals: [
    { group: "CH3", mult: "d, 9.5", shifts: { "THF-d8": 2.58, "CD2Cl2": 2.6, "CDCl3": 2.65, "toluene-d8": 2.42, "C6D6": 2.4, "C6D5Cl": 2.47, "acetone-d6": 2.59, "DMSO-d6": 2.53, "CD3CN": 2.57, "TFE-d3": 2.63, "CD3OD": 2.64, "D2O": 2.61 } },
  ] },
  { id: "hydrogen", name: "H_{2}", signals: [
    { group: "H2", mult: "s", shifts: { "THF-d8": 4.55, "CD2Cl2": 4.59, "CDCl3": 4.62, "toluene-d8": 4.5, "C6D6": 4.47, "C6D5Cl": 4.49, "acetone-d6": 4.54, "DMSO-d6": 4.61, "CD3CN": 4.57, "TFE-d3": 4.53, "CD3OD": 4.56 } },
  ] },
  { id: "imidazole", name: "Imidazole", signals: [
    { group: "CH(2)", mult: "s", shifts: { "THF-d8": 7.48, "CD2Cl2": 7.63, "CDCl3": 7.67, "toluene-d8": 7.3, "C6D6": 7.33, "C6D5Cl": 7.53, "acetone-d6": 7.62, "DMSO-d6": 7.63, "CD3CN": 7.57, "TFE-d3": 7.61, "CD3OD": 7.67, "D2O": 7.78 } },
    { group: "CH(4,5)", mult: "s", shifts: { "THF-d8": 6.94, "CD2Cl2": 7.07, "CDCl3": 7.1, "toluene-d8": 6.86, "C6D6": 6.9, "C6D5Cl": 7.01, "acetone-d6": 7.04, "DMSO-d6": 7.01, "CD3CN": 7.01, "TFE-d3": 7.03, "CD3OD": 7.05, "D2O": 7.14 } },
  ] },
  { id: "methane", name: "CH_{4}", signals: [
    { group: "CH4", mult: "s", shifts: { "THF-d8": 0.19, "CD2Cl2": 0.21, "CDCl3": 0.22, "toluene-d8": 0.17, "C6D6": 0.16, "C6D5Cl": 0.15, "acetone-d6": 0.17, "DMSO-d6": 0.2, "CD3CN": 0.2, "TFE-d3": 0.18, "CD3OD": 0.2, "D2O": 0.18 } },
  ] },
  { id: "methanol", name: "MeOH", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 3.27, "CD2Cl2": 3.42, "CDCl3": 3.49, "toluene-d8": 3.03, "C6D6": 3.07, "C6D5Cl": 3.25, "acetone-d6": 3.31, "DMSO-d6": 3.16, "CD3CN": 3.28, "TFE-d3": 3.44, "CD3OD": 3.34, "D2O": 3.34 } },
    { group: "OH", mult: "s", broad: true, shifts: { "THF-d8": 3.02, "CD2Cl2": 1.09, "CDCl3": 1.09, "C6D5Cl": 1.3, "acetone-d6": 3.12, "DMSO-d6": 4.01, "CD3CN": 2.16 } },
  ] },
  { id: "nitromethane", name: "MeNO_{2}", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 4.31, "CD2Cl2": 4.31, "CDCl3": 4.33, "toluene-d8": 3.01, "C6D6": 2.94, "C6D5Cl": 3.59, "acetone-d6": 4.43, "DMSO-d6": 4.42, "CD3CN": 4.31, "TFE-d3": 4.28, "CD3OD": 4.34, "D2O": 4.4 } },
  ] },
  { id: "pentane", name: "Pentane", signals: [
    { group: "CH3", mult: "t, 7", shifts: { "THF-d8": 0.89, "CD2Cl2": 0.89, "CDCl3": 0.88, "toluene-d8": 0.87, "C6D6": 0.87, "C6D5Cl": 0.84, "acetone-d6": 0.88, "DMSO-d6": 0.86, "CD3CN": 0.89, "TFE-d3": 0.9, "CD3OD": 0.9 } },
    { group: "CH2", mult: "m", shifts: { "THF-d8": 1.31, "CD2Cl2": 1.3, "CDCl3": 1.27, "toluene-d8": 1.25, "C6D6": 1.23, "C6D5Cl": 1.23, "acetone-d6": 1.27, "DMSO-d6": 1.27, "CD3CN": 1.29, "TFE-d3": 1.33, "CD3OD": 1.29 } },
  ] },
  { id: "propane", name: "Propane", signals: [
    { group: "CH3", mult: "t, 7.3", shifts: { "THF-d8": 0.9, "CD2Cl2": 0.9, "CDCl3": 0.9, "toluene-d8": 0.89, "C6D6": 0.86, "C6D5Cl": 0.84, "acetone-d6": 0.88, "DMSO-d6": 0.87, "CD3CN": 0.9, "TFE-d3": 0.9, "CD3OD": 0.91, "D2O": 0.88 } },
    { group: "CH2", mult: "sept, 7.3", shifts: { "THF-d8": 1.33, "CD2Cl2": 1.32, "CDCl3": 1.32, "toluene-d8": 1.32, "C6D6": 1.26, "C6D5Cl": 1.26, "acetone-d6": 1.31, "DMSO-d6": 1.29, "CD3CN": 1.33, "TFE-d3": 1.33, "CD3OD": 1.34, "D2O": 1.3 } },
  ] },
  { id: "ipa", name: "^{i}PrOH", signals: [
    { group: "CH3", mult: "d, 6", shifts: { "THF-d8": 1.08, "CD2Cl2": 1.17, "CDCl3": 1.22, "toluene-d8": 0.95, "C6D6": 0.95, "C6D5Cl": 1.04, "acetone-d6": 1.1, "DMSO-d6": 1.04, "CD3CN": 1.09, "TFE-d3": 1.2, "CD3OD": 1.5, "D2O": 1.17 } },
    { group: "CH", mult: "sept, 6", shifts: { "THF-d8": 3.82, "CD2Cl2": 3.97, "CDCl3": 4.04, "toluene-d8": 3.65, "C6D6": 3.67, "C6D5Cl": 3.82, "acetone-d6": 3.9, "DMSO-d6": 3.78, "CD3CN": 3.87, "TFE-d3": 4.05, "CD3OD": 3.92, "D2O": 4.02 } },
  ] },
  { id: "propylene", name: "Propylene", signals: [
    { group: "CH3", mult: "dt, 6.4, 1.5", shifts: { "THF-d8": 1.69, "CD2Cl2": 1.71, "CDCl3": 1.73, "toluene-d8": 1.55, "C6D6": 1.55, "C6D5Cl": 1.58, "acetone-d6": 1.68, "DMSO-d6": 1.68, "CD3CN": 1.7, "TFE-d3": 1.7, "CD3OD": 1.7, "D2O": 1.7 } },
    { group: "CH2(1)", mult: "dm, 10", shifts: { "THF-d8": 4.89, "CD2Cl2": 4.93, "CDCl3": 4.94, "toluene-d8": 4.92, "C6D6": 4.95, "C6D5Cl": 4.91, "acetone-d6": 4.9, "DMSO-d6": 4.94, "CD3CN": 4.93, "TFE-d3": 4.93, "CD3OD": 4.91, "D2O": 4.95 } },
    { group: "CH2(2)", mult: "dm, 17", shifts: { "THF-d8": 4.99, "CD2Cl2": 5.03, "CDCl3": 5.03, "toluene-d8": 4.98, "C6D6": 5.01, "C6D5Cl": 4.98, "acetone-d6": 5.0, "DMSO-d6": 5.03, "CD3CN": 5.04, "TFE-d3": 5.03, "CD3OD": 5.01, "D2O": 5.06 } },
    { group: "CH", mult: "m", shifts: { "THF-d8": 5.79, "CD2Cl2": 5.84, "CDCl3": 5.83, "toluene-d8": 5.7, "C6D6": 5.72, "C6D5Cl": 5.72, "acetone-d6": 5.81, "DMSO-d6": 5.8, "CD3CN": 5.85, "TFE-d3": 5.87, "CD3OD": 5.82, "D2O": 5.9 } },
  ] },
  { id: "pyridine", name: "Pyridine", signals: [
    { group: "CH(2)", mult: "m", shifts: { "THF-d8": 8.54, "CD2Cl2": 8.59, "CDCl3": 8.62, "toluene-d8": 8.47, "C6D6": 8.53, "C6D5Cl": 8.51, "acetone-d6": 8.58, "DMSO-d6": 8.58, "CD3CN": 8.57, "TFE-d3": 8.45, "CD3OD": 8.53, "D2O": 8.52 } },
    { group: "CH(3)", mult: "m", shifts: { "THF-d8": 7.25, "CD2Cl2": 7.28, "CDCl3": 7.29, "toluene-d8": 6.67, "C6D6": 6.66, "C6D5Cl": 6.9, "acetone-d6": 7.35, "DMSO-d6": 7.39, "CD3CN": 7.33, "TFE-d3": 7.4, "CD3OD": 7.44, "D2O": 7.45 } },
    { group: "CH(4)", mult: "m", shifts: { "THF-d8": 7.65, "CD2Cl2": 7.68, "CDCl3": 7.68, "toluene-d8": 6.99, "C6D6": 6.98, "C6D5Cl": 7.25, "acetone-d6": 7.76, "DMSO-d6": 7.79, "CD3CN": 7.73, "TFE-d3": 7.82, "CD3OD": 7.85, "D2O": 7.87 } },
  ] },
  { id: "pyrrole", name: "Pyrrole", signals: [
    { group: "NH", mult: "br t", broad: true, shifts: { "THF-d8": 9.96, "CD2Cl2": 8.69, "CDCl3": 8.4, "toluene-d8": 7.71, "C6D6": 7.8, "C6D5Cl": 8.61, "acetone-d6": 10.02, "DMSO-d6": 10.75, "CD3CN": 9.27 } },
    { group: "CH(2,5)", mult: "m", shifts: { "THF-d8": 6.66, "CD2Cl2": 6.79, "CDCl3": 6.83, "toluene-d8": 6.43, "C6D6": 6.48, "C6D5Cl": 6.62, "acetone-d6": 6.77, "DMSO-d6": 6.73, "CD3CN": 6.75, "TFE-d3": 6.84, "CD3OD": 6.72, "D2O": 6.93 } },
    { group: "CH(3,4)", mult: "m", shifts: { "THF-d8": 6.02, "CD2Cl2": 6.19, "CDCl3": 6.26, "toluene-d8": 6.27, "C6D6": 6.37, "C6D5Cl": 6.27, "acetone-d6": 6.07, "DMSO-d6": 6.01, "CD3CN": 6.1, "TFE-d3": 6.24, "CD3OD": 6.08, "D2O": 6.26 } },
  ] },
  { id: "pyrrolidine", name: "Pyrrolidine", signals: [
    { group: "CH2(2,5)", mult: "m", shifts: { "THF-d8": 2.75, "CD2Cl2": 2.82, "CDCl3": 2.87, "toluene-d8": 2.54, "C6D6": 2.54, "C6D5Cl": 2.64, "DMSO-d6": 2.67, "CD3CN": 2.75, "TFE-d3": 3.11, "CD3OD": 2.8, "D2O": 3.07 } },
    { group: "CH2(3,4)", mult: "m", shifts: { "THF-d8": 1.59, "CD2Cl2": 1.67, "CDCl3": 1.68, "toluene-d8": 1.36, "C6D6": 1.33, "C6D5Cl": 1.43, "DMSO-d6": 1.55, "CD3CN": 1.61, "TFE-d3": 1.93, "CD3OD": 1.72, "D2O": 1.87 } },
  ] },
  { id: "silicone-grease", name: "Silicone grease", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 0.11, "CD2Cl2": 0.09, "CDCl3": 0.07, "toluene-d8": 0.26, "C6D6": 0.29, "C6D5Cl": 0.14, "acetone-d6": 0.13, "DMSO-d6": -0.06, "CD3CN": 0.08, "TFE-d3": 0.16, "CD3OD": 0.1 } },
  ] },
  { id: "thf", name: "THF", signals: [
    { group: "CH2(2,5)", mult: "m", shifts: { "THF-d8": 3.62, "CD2Cl2": 3.69, "CDCl3": 3.76, "toluene-d8": 3.54, "C6D6": 3.57, "C6D5Cl": 3.59, "acetone-d6": 3.63, "DMSO-d6": 3.6, "CD3CN": 3.64, "TFE-d3": 3.78, "CD3OD": 3.71, "D2O": 3.74 } },
    { group: "CH2(3,4)", mult: "m", shifts: { "THF-d8": 1.79, "CD2Cl2": 1.82, "CDCl3": 1.85, "toluene-d8": 1.43, "C6D6": 1.4, "C6D5Cl": 1.55, "acetone-d6": 1.79, "DMSO-d6": 1.76, "CD3CN": 1.8, "TFE-d3": 1.91, "CD3OD": 1.87, "D2O": 1.88 } },
  ] },
  { id: "toluene", name: "Toluene", signals: [
    { group: "CH3", mult: "s", shifts: { "THF-d8": 2.31, "CD2Cl2": 2.34, "CDCl3": 2.36, "toluene-d8": 2.11, "C6D6": 2.11, "C6D5Cl": 2.16, "acetone-d6": 2.32, "DMSO-d6": 2.3, "CD3CN": 2.33, "TFE-d3": 2.33, "CD3OD": 2.32 } },
    { group: "CH(2,4,6)", mult: "m", shifts: { "THF-d8": 7.1, "CD2Cl2": 7.15, "CDCl3": 7.17, "C6D6": 7.02, "DMSO-d6": 7.18, "CD3OD": 7.16 } },
    { group: "CH(3,5)", mult: "m", shifts: { "THF-d8": 7.19, "CD2Cl2": 7.24, "CDCl3": 7.25, "toluene-d8": 7.09, "C6D6": 7.13, "DMSO-d6": 7.25, "CD3OD": 7.16 } },
  ] },
  { id: "triethylamine", name: "Et_{3}N", signals: [
    { group: "CH3", mult: "t, 7", shifts: { "THF-d8": 0.97, "CD2Cl2": 0.99, "CDCl3": 1.03, "toluene-d8": 0.95, "C6D6": 0.96, "C6D5Cl": 0.93, "acetone-d6": 0.96, "DMSO-d6": 0.93, "CD3CN": 0.96, "TFE-d3": 1.31, "CD3OD": 1.05, "D2O": 0.99 } },
    { group: "CH2", mult: "q,7", shifts: { "THF-d8": 2.46, "CD2Cl2": 2.48, "CDCl3": 2.53, "toluene-d8": 2.39, "C6D6": 2.4, "C6D5Cl": 2.39, "acetone-d6": 2.45, "DMSO-d6": 2.43, "CD3CN": 2.45, "TFE-d3": 3.12, "CD3OD": 2.58, "D2O": 2.57 } },
  ] },
];

export const IMPURITIES_13C: ImpurityCompound[] = [
  { id: "acetic-acid", name: "AcOH", signals: [
    { group: "CO", shifts: { "THF-d8": 171.69, "CD2Cl2": 175.85, "CDCl3": 175.99, "toluene-d8": 175.3, "C6D6": 175.82, "C6D5Cl": 175.67, "acetone-d6": 172.31, "DMSO-d6": 171.93, "CD3CN": 173.21, "TFE-d3": 177.96, "CD3OD": 175.11, "D2O": 177.21 } },
    { group: "CH3", shifts: { "THF-d8": 20.13, "CD2Cl2": 20.91, "CDCl3": 20.81, "toluene-d8": 20.27, "C6D6": 20.37, "C6D5Cl": 20.4, "acetone-d6": 20.51, "DMSO-d6": 20.95, "CD3CN": 20.73, "TFE-d3": 20.91, "CD3OD": 20.56, "D2O": 21.03 } },
  ] },
  { id: "acetone", name: "Acetone", signals: [
    { group: "CO", shifts: { "THF-d8": 204.19, "CD2Cl2": 206.78, "CDCl3": 207.07, "toluene-d8": 204.0, "C6D6": 204.43, "C6D5Cl": 204.83, "acetone-d6": 205.87, "DMSO-d6": 206.31, "CD3CN": 207.43, "TFE-d3": 32.35, "CD3OD": 209.67, "D2O": 215.94 } },
    { group: "CH3", shifts: { "THF-d8": 30.17, "CD2Cl2": 31.0, "CDCl3": 30.92, "toluene-d8": 30.03, "C6D6": 30.14, "C6D5Cl": 30.12, "acetone-d6": 30.6, "DMSO-d6": 30.56, "CD3CN": 30.91, "TFE-d3": 214.98, "CD3OD": 30.67, "D2O": 30.89 } },
  ] },
  { id: "acetonitrile", name: "MeCN", signals: [
    { group: "CN", shifts: { "THF-d8": 116.79, "CD2Cl2": 116.92, "CDCl3": 116.43, "toluene-d8": 115.76, "C6D6": 116.02, "C6D5Cl": 115.93, "acetone-d6": 117.6, "DMSO-d6": 117.91, "CD3CN": 118.26, "TFE-d3": 118.95, "CD3OD": 118.06, "D2O": 119.68 } },
    { group: "CH3", shifts: { "THF-d8": 0.45, "CD2Cl2": 2.03, "CDCl3": 1.89, "toluene-d8": 0.03, "C6D6": 0.2, "C6D5Cl": 0.63, "acetone-d6": 1.12, "DMSO-d6": 1.03, "CD3CN": 1.79, "TFE-d3": 1.0, "CD3OD": 0.85, "D2O": 1.47 } },
  ] },
  { id: "benzene", name: "Benzene", signals: [
    { group: "CH", shifts: { "THF-d8": 128.84, "CD2Cl2": 128.68, "CDCl3": 128.37, "toluene-d8": 128.57, "C6D6": 128.62, "C6D5Cl": 128.38, "acetone-d6": 129.15, "DMSO-d6": 128.3, "CD3CN": 129.32, "TFE-d3": 129.84, "CD3OD": 129.34 } },
  ] },
  { id: "tbuoh", name: "^{t}BuOH", signals: [
    { group: "C", shifts: { "THF-d8": 67.5, "CD2Cl2": 69.11, "CDCl3": 69.15, "toluene-d8": 68.12, "C6D6": 68.19, "C6D5Cl": 68.19, "acetone-d6": 68.13, "DMSO-d6": 66.88, "CD3CN": 68.74, "TFE-d3": 72.35, "CD3OD": 69.4, "D2O": 70.36 } },
    { group: "CH3", shifts: { "THF-d8": 30.57, "CD2Cl2": 31.46, "CDCl3": 31.25, "toluene-d8": 30.49, "C6D6": 30.47, "C6D5Cl": 31.13, "acetone-d6": 30.72, "DMSO-d6": 30.38, "CD3CN": 30.68, "TFE-d3": 31.07, "CD3OD": 30.91, "D2O": 30.29 } },
  ] },
  { id: "co2", name: "CO_{2}", signals: [
    { group: "CO2", shifts: { "THF-d8": 125.69, "CD2Cl2": 125.26, "CDCl3": 124.99, "toluene-d8": 124.86, "C6D6": 124.76, "C6D5Cl": 126.08, "acetone-d6": 125.81, "DMSO-d6": 124.21, "CD3CN": 125.89, "TFE-d3": 126.92, "CD3OD": 126.31 } },
  ] },
  { id: "cs2", name: "CS_{2}", signals: [
    { group: "CS2", shifts: { "THF-d8": 193.37, "CD2Cl2": 192.95, "CDCl3": 192.83, "toluene-d8": 192.71, "C6D6": 192.69, "C6D5Cl": 192.49, "acetone-d6": 193.58, "DMSO-d6": 192.63, "CD3CN": 193.6, "TFE-d3": 196.26, "CD3OD": 193.82, "D2O": 197.25 } },
  ] },
  { id: "ccl4", name: "CCl_{4}", signals: [
    { group: "CCl4", shifts: { "THF-d8": 96.89, "CD2Cl2": 96.52, "CDCl3": 96.34, "toluene-d8": 96.57, "C6D6": 96.44, "C6D5Cl": 96.38, "acetone-d6": 96.65, "DMSO-d6": 95.44, "CD3CN": 96.68, "TFE-d3": 97.74, "CD3OD": 97.21, "D2O": 96.73 } },
  ] },
  { id: "chloroform", name: "CHCl_{3}", signals: [
    { group: "CH", shifts: { "THF-d8": 79.24, "CD2Cl2": 77.99, "CDCl3": 77.36, "toluene-d8": 77.89, "C6D6": 77.79, "C6D5Cl": 77.67, "acetone-d6": 79.19, "DMSO-d6": 79.16, "CD3CN": 79.17, "TFE-d3": 78.83, "CD3OD": 79.44 } },
  ] },
  { id: "18-crown-6", name: "18-Crown-6", signals: [
    { group: "CH2", shifts: { "THF-d8": 71.34, "CD2Cl2": 70.47, "CDCl3": 70.55, "toluene-d8": 70.86, "C6D6": 70.59, "C6D5Cl": 70.55, "acetone-d6": 71.25, "DMSO-d6": 69.85, "CD3CN": 71.22, "TFE-d3": 70.8, "CD3OD": 71.47, "D2O": 70.14 } },
  ] },
  { id: "cyclohexane", name: "Cyclohexane", signals: [
    { group: "CH2", shifts: { "THF-d8": 27.58, "CD2Cl2": 27.38, "CDCl3": 26.94, "toluene-d8": 27.31, "C6D6": 27.23, "C6D5Cl": 26.99, "acetone-d6": 27.51, "DMSO-d6": 26.33, "CD3CN": 27.63, "TFE-d3": 28.34, "CD3OD": 27.96 } },
  ] },
  { id: "dce", name: "1,2-DCE", signals: [
    { group: "CH2", shifts: { "THF-d8": 44.64, "CD2Cl2": 44.35, "CDCl3": 43.5, "toluene-d8": 43.4, "C6D6": 43.59, "C6D5Cl": 43.6, "acetone-d6": 45.25, "DMSO-d6": 45.02, "CD3CN": 45.54, "TFE-d3": 45.28, "CD3OD": 45.11 } },
  ] },
  { id: "dichloromethane", name: "CH_{2}Cl_{2}", signals: [
    { group: "CH2", shifts: { "THF-d8": 54.67, "CD2Cl2": 54.24, "CDCl3": 53.52, "toluene-d8": 53.47, "C6D6": 53.46, "C6D5Cl": 53.54, "acetone-d6": 54.95, "DMSO-d6": 54.84, "CD3CN": 55.32, "TFE-d3": 54.46, "CD3OD": 54.78 } },
  ] },
  { id: "diethyl-ether", name: "Et_{2}O", signals: [
    { group: "CH3", shifts: { "THF-d8": 15.49, "CD2Cl2": 15.44, "CDCl3": 15.2, "toluene-d8": 15.47, "C6D6": 15.46, "C6D5Cl": 15.35, "acetone-d6": 15.78, "DMSO-d6": 15.12, "CD3CN": 15.63, "TFE-d3": 15.33, "CD3OD": 15.46, "D2O": 14.77 } },
    { group: "CH2", shifts: { "THF-d8": 66.14, "CD2Cl2": 66.11, "CDCl3": 65.91, "toluene-d8": 65.94, "C6D6": 65.94, "C6D5Cl": 65.79, "acetone-d6": 66.12, "DMSO-d6": 62.05, "CD3CN": 66.32, "TFE-d3": 67.55, "CD3OD": 66.88, "D2O": 66.42 } },
  ] },
  { id: "diglyme", name: "Diglyme", signals: [
    { group: "CH3", shifts: { "THF-d8": 58.72, "CD2Cl2": 58.95, "CDCl3": 59.01, "toluene-d8": 58.62, "C6D6": 58.66, "C6D5Cl": 58.42, "acetone-d6": 58.77, "DMSO-d6": 57.98, "CD3CN": 58.9, "TFE-d3": 59.4, "CD3OD": 59.06, "D2O": 58.67 } },
    { group: "CH2", shifts: { "THF-d8": 71.17, "CD2Cl2": 70.7, "CDCl3": 70.51, "toluene-d8": 70.92, "C6D6": 70.87, "C6D5Cl": 70.56, "acetone-d6": 71.03, "DMSO-d6": 69.54, "CD3CN": 70.99, "TFE-d3": 73.05, "CD3OD": 71.33, "D2O": 70.05 } },
    { group: "CH2", shifts: { "THF-d8": 72.72, "CD2Cl2": 72.25, "CDCl3": 71.9, "toluene-d8": 72.39, "C6D6": 72.35, "C6D5Cl": 72.07, "acetone-d6": 72.63, "DMSO-d6": 71.25, "CD3CN": 72.63, "TFE-d3": 71.33, "CD3OD": 72.92, "D2O": 71.63 } },
  ] },
  { id: "dmf", name: "DMF", signals: [
    { group: "CH", shifts: { "THF-d8": 161.96, "CD2Cl2": 162.57, "CDCl3": 162.62, "toluene-d8": 161.93, "C6D6": 162.13, "C6D5Cl": 162.01, "acetone-d6": 162.79, "DMSO-d6": 162.29, "CD3CN": 163.31, "TFE-d3": 166.01, "CD3OD": 164.73, "D2O": 165.53 } },
    { group: "CH3", shifts: { "THF-d8": 35.65, "CD2Cl2": 36.56, "CDCl3": 36.5, "toluene-d8": 35.22, "C6D6": 35.25, "C6D5Cl": 35.45, "acetone-d6": 36.15, "DMSO-d6": 35.73, "CD3CN": 36.57, "TFE-d3": 37.76, "CD3OD": 36.89, "D2O": 37.54 } },
    { group: "CH3", shifts: { "THF-d8": 30.7, "CD2Cl2": 31.39, "CDCl3": 31.45, "toluene-d8": 30.64, "C6D6": 30.72, "C6D5Cl": 30.71, "acetone-d6": 31.03, "DMSO-d6": 30.73, "CD3CN": 31.32, "TFE-d3": 30.96, "CD3OD": 31.61, "D2O": 32.03 } },
  ] },
  { id: "dioxane", name: "1,4-Dioxane", signals: [
    { group: "CH2", shifts: { "THF-d8": 67.65, "CD2Cl2": 67.47, "CDCl3": 67.14, "toluene-d8": 67.17, "C6D6": 67.16, "C6D5Cl": 66.95, "acetone-d6": 67.6, "DMSO-d6": 66.36, "CD3CN": 67.72, "TFE-d3": 68.52, "CD3OD": 68.11, "D2O": 67.19 } },
  ] },
  { id: "dme", name: "DME", signals: [
    { group: "CH3", shifts: { "THF-d8": 58.72, "CD2Cl2": 59.02, "CDCl3": 59.08, "toluene-d8": 58.63, "C6D6": 58.68, "C6D5Cl": 58.31, "acetone-d6": 58.45, "DMSO-d6": 58.03, "CD3CN": 58.89, "TFE-d3": 59.52, "CD3OD": 59.06, "D2O": 58.67 } },
    { group: "CH2", shifts: { "THF-d8": 72.58, "CD2Cl2": 72.24, "CDCl3": 71.84, "toluene-d8": 72.25, "C6D6": 72.21, "C6D5Cl": 71.81, "acetone-d6": 72.47, "DMSO-d6": 71.17, "CD3CN": 72.47, "TFE-d3": 72.87, "CD3OD": 72.72, "D2O": 71.49 } },
  ] },
  { id: "ethane", name: "Ethane", signals: [
    { group: "CH3", shifts: { "THF-d8": 6.79, "CD2Cl2": 6.91, "CDCl3": 6.89, "toluene-d8": 6.94, "C6D6": 6.96, "C6D5Cl": 6.91, "acetone-d6": 6.88, "DMSO-d6": 6.61, "CD3CN": 6.99, "TFE-d3": 7.01, "CD3OD": 6.98 } },
  ] },
  { id: "ethanol", name: "EtOH", signals: [
    { group: "CH3", shifts: { "THF-d8": 18.9, "CD2Cl2": 18.69, "CDCl3": 18.41, "toluene-d8": 18.78, "C6D6": 18.72, "C6D5Cl": 18.55, "acetone-d6": 18.89, "DMSO-d6": 18.51, "CD3CN": 18.8, "TFE-d3": 18.11, "CD3OD": 18.4, "D2O": 17.47 } },
    { group: "CH2", shifts: { "THF-d8": 57.6, "CD2Cl2": 58.57, "CDCl3": 58.28, "toluene-d8": 57.81, "C6D6": 57.86, "C6D5Cl": 57.63, "acetone-d6": 57.72, "DMSO-d6": 56.07, "CD3CN": 57.96, "TFE-d3": 59.68, "CD3OD": 58.26, "D2O": 58.05 } },
  ] },
  { id: "ethyl-acetate", name: "EtOAc", signals: [
    { group: "CH3CO", shifts: { "THF-d8": 20.45, "CD2Cl2": 21.15, "CDCl3": 21.04, "toluene-d8": 20.46, "C6D6": 20.56, "C6D5Cl": 20.5, "acetone-d6": 20.83, "DMSO-d6": 20.68, "CD3CN": 21.16, "TFE-d3": 21.18, "CD3OD": 20.88, "D2O": 21.15 } },
    { group: "CO", shifts: { "THF-d8": 170.32, "CD2Cl2": 171.24, "CDCl3": 171.36, "toluene-d8": 170.02, "C6D6": 170.44, "C6D5Cl": 170.2, "acetone-d6": 170.96, "DMSO-d6": 170.31, "CD3CN": 171.68, "TFE-d3": 175.55, "CD3OD": 172.89, "D2O": 175.26 } },
    { group: "CH2", shifts: { "THF-d8": 60.3, "CD2Cl2": 60.63, "CDCl3": 60.49, "toluene-d8": 60.08, "C6D6": 60.21, "C6D5Cl": 60.06, "acetone-d6": 60.56, "DMSO-d6": 59.74, "CD3CN": 60.98, "TFE-d3": 62.7, "CD3OD": 61.5, "D2O": 62.32 } },
    { group: "CH3", shifts: { "THF-d8": 14.37, "CD2Cl2": 14.37, "CDCl3": 14.19, "toluene-d8": 14.23, "C6D6": 14.19, "C6D5Cl": 14.07, "acetone-d6": 14.5, "DMSO-d6": 14.4, "CD3CN": 14.54, "TFE-d3": 14.36, "CD3OD": 14.49, "D2O": 13.92 } },
  ] },
  { id: "ethylene", name: "Ethylene", signals: [
    { group: "CH2", shifts: { "THF-d8": 123.09, "CD2Cl2": 123.2, "CDCl3": 123.13, "toluene-d8": 122.92, "C6D6": 122.96, "C6D5Cl": 122.95, "acetone-d6": 123.47, "DMSO-d6": 123.52, "CD3CN": 123.69, "TFE-d3": 124.08, "CD3OD": 123.46 } },
  ] },
  { id: "ethylene-glycol", name: "Ethylene glycol", signals: [
    { group: "CH2", shifts: { "THF-d8": 64.35, "CD2Cl2": 64.08, "CDCl3": 63.79, "toluene-d8": 64.29, "C6D6": 64.34, "C6D5Cl": 64.03, "acetone-d6": 64.26, "DMSO-d6": 62.76, "CD3CN": 64.22, "TFE-d3": 64.87, "CD3OD": 64.3, "D2O": 63.17 } },
  ] },
  { id: "grease", name: "Grease", signals: [
    { group: "CH2", shifts: { "THF-d8": 30.45, "CD2Cl2": 30.14, "CDCl3": 29.71, "toluene-d8": 30.31, "C6D6": 30.22, "C6D5Cl": 30.11 } },
  ] },
  { id: "hexamethylbenzene", name: "C_{6}Me_{6}", signals: [
    { group: "C", shifts: { "THF-d8": 131.88, "CD2Cl2": 132.09, "CDCl3": 132.21, "toluene-d8": 131.72, "C6D6": 131.79, "C6D5Cl": 131.54, "acetone-d6": 132.22, "DMSO-d6": 131.1, "CD3CN": 132.61, "TFE-d3": 134.04, "CD3OD": 132.53 } },
    { group: "CH3", shifts: { "THF-d8": 16.71, "CD2Cl2": 16.93, "CDCl3": 16.98, "toluene-d8": 16.84, "C6D6": 16.95, "C6D5Cl": 16.68, "acetone-d6": 16.86, "DMSO-d6": 16.6, "CD3CN": 16.94, "TFE-d3": 17.04, "CD3OD": 16.9 } },
  ] },
  { id: "hexane", name: "Hexane", signals: [
    { group: "CH3", shifts: { "THF-d8": 14.22, "CD2Cl2": 14.28, "CDCl3": 14.14, "toluene-d8": 14.34, "C6D6": 14.32, "C6D5Cl": 14.18, "acetone-d6": 14.34, "DMSO-d6": 13.88, "CD3CN": 14.43, "TFE-d3": 14.63, "CD3OD": 14.45 } },
    { group: "CH2(2,5)", shifts: { "THF-d8": 23.33, "CD2Cl2": 23.07, "CDCl3": 22.7, "toluene-d8": 23.12, "C6D6": 23.04, "C6D5Cl": 22.86, "acetone-d6": 23.28, "DMSO-d6": 22.05, "CD3CN": 23.4, "TFE-d3": 24.06, "CD3OD": 23.68 } },
    { group: "CH2(3,4)", shifts: { "THF-d8": 32.34, "CD2Cl2": 32.01, "CDCl3": 31.64, "toluene-d8": 32.06, "C6D6": 31.96, "C6D5Cl": 31.77, "acetone-d6": 32.3, "DMSO-d6": 30.95, "CD3CN": 32.36, "TFE-d3": 33.17, "CD3OD": 32.73 } },
  ] },
  { id: "hmdso", name: "HMDSO", signals: [
    { group: "CH3", shifts: { "THF-d8": 1.83, "CD2Cl2": 1.96, "CDCl3": 1.97, "toluene-d8": 1.99, "C6D6": 2.05, "C6D5Cl": 1.92, "acetone-d6": 2.01, "DMSO-d6": 1.96, "CD3CN": 2.07, "TFE-d3": 2.09, "CD3OD": 1.99, "D2O": 2.31 } },
  ] },
  { id: "hmpa", name: "HMPA", signals: [
    { group: "CH3", shifts: { "THF-d8": 36.89, "CD2Cl2": 36.99, "CDCl3": 36.87, "toluene-d8": 36.8, "C6D6": 36.88, "C6D5Cl": 36.64, "acetone-d6": 37.04, "DMSO-d6": 36.42, "CD3CN": 37.1, "TFE-d3": 37.21, "CD3OD": 37.0, "D2O": 36.46 } },
  ] },
  { id: "imidazole", name: "Imidazole", signals: [
    { group: "CH(2)", shifts: { "THF-d8": 135.72, "CD2Cl2": 135.76, "CDCl3": 135.38, "toluene-d8": 135.57, "C6D6": 135.76, "C6D5Cl": 135.5, "acetone-d6": 135.89, "DMSO-d6": 135.15, "CD3CN": 136.33, "TFE-d3": 136.58, "CD3OD": 136.31, "D2O": 136.65 } },
    { group: "CH(4,5)", shifts: { "THF-d8": 122.2, "CD2Cl2": 122.16, "CDCl3": 122.0, "toluene-d8": 122.13, "C6D6": 122.16, "C6D5Cl": 121.96, "acetone-d6": 122.31, "DMSO-d6": 121.55, "CD3CN": 122.78, "TFE-d3": 122.93, "CD3OD": 122.6, "D2O": 122.43 } },
  ] },
  { id: "methane", name: "CH_{4}", signals: [
    { group: "CH4", shifts: { "THF-d8": -4.9, "CD2Cl2": -4.33, "CDCl3": -4.63, "toluene-d8": -4.34, "C6D6": -4.29, "C6D5Cl": -4.33, "acetone-d6": -5.33, "DMSO-d6": -4.01, "CD3CN": -4.61, "TFE-d3": -5.88, "CD3OD": -4.9 } },
  ] },
  { id: "methanol", name: "MeOH", signals: [
    { group: "CH3", shifts: { "THF-d8": 49.64, "CD2Cl2": 50.45, "CDCl3": 50.41, "toluene-d8": 49.9, "C6D6": 49.97, "C6D5Cl": 49.66, "acetone-d6": 49.77, "DMSO-d6": 48.59, "CD3CN": 49.9, "TFE-d3": 50.67, "CD3OD": 49.86, "D2O": 49.5 } },
  ] },
  { id: "nitromethane", name: "MeNO_{2}", signals: [
    { group: "CH3", shifts: { "THF-d8": 62.49, "CD2Cl2": 63.03, "CDCl3": 62.5, "toluene-d8": 61.14, "C6D6": 61.16, "C6D5Cl": 61.68, "acetone-d6": 63.21, "DMSO-d6": 63.28, "CD3CN": 63.66, "TFE-d3": 63.17, "CD3OD": 63.08, "D2O": 63.22 } },
  ] },
  { id: "pentane", name: "Pentane", signals: [
    { group: "CH3", shifts: { "THF-d8": 14.18, "CD2Cl2": 14.24, "CDCl3": 14.08, "toluene-d8": 14.27, "C6D6": 14.25, "C6D5Cl": 14.1, "acetone-d6": 14.29, "DMSO-d6": 13.28, "CD3CN": 14.37, "TFE-d3": 14.54, "CD3OD": 14.39 } },
    { group: "CH2(2,4)", shifts: { "THF-d8": 23.0, "CD2Cl2": 22.77, "CDCl3": 22.38, "toluene-d8": 22.79, "C6D6": 22.72, "C6D5Cl": 22.54, "acetone-d6": 22.98, "DMSO-d6": 21.7, "CD3CN": 23.08, "TFE-d3": 23.75, "CD3OD": 23.38 } },
    { group: "CH2(3)", shifts: { "THF-d8": 34.87, "CD2Cl2": 34.57, "CDCl3": 34.16, "toluene-d8": 34.54, "C6D6": 34.45, "C6D5Cl": 34.26, "acetone-d6": 34.83, "DMSO-d6": 33.48, "CD3CN": 34.89, "TFE-d3": 35.76, "CD3OD": 35.3 } },
  ] },
  { id: "propane", name: "Propane", signals: [
    { group: "CH3", shifts: { "THF-d8": 16.6, "CD2Cl2": 16.63, "CDCl3": 16.63, "toluene-d8": 16.65, "C6D6": 16.66, "C6D5Cl": 16.56, "acetone-d6": 16.68, "DMSO-d6": 16.34, "CD3CN": 16.73, "TFE-d3": 16.93, "CD3OD": 16.8 } },
    { group: "CH2", shifts: { "THF-d8": 16.82, "CD2Cl2": 16.63, "CDCl3": 16.37, "toluene-d8": 16.63, "C6D6": 16.6, "C6D5Cl": 16.48, "acetone-d6": 16.78, "DMSO-d6": 15.67, "CD3CN": 16.91, "TFE-d3": 17.46, "CD3OD": 17.19 } },
  ] },
  { id: "ipa", name: "^{i}PrOH", signals: [
    { group: "CH3", shifts: { "THF-d8": 25.7, "CD2Cl2": 25.43, "CDCl3": 25.14, "toluene-d8": 25.24, "C6D6": 25.18, "C6D5Cl": 25.14, "acetone-d6": 25.67, "DMSO-d6": 25.43, "CD3CN": 25.55, "TFE-d3": 25.21, "CD3OD": 25.27, "D2O": 24.38 } },
    { group: "CH", shifts: { "THF-d8": 66.14, "CD2Cl2": 64.67, "CDCl3": 64.5, "toluene-d8": 64.12, "C6D6": 64.23, "C6D5Cl": 64.18, "acetone-d6": 63.85, "DMSO-d6": 64.92, "CD3CN": 64.3, "TFE-d3": 66.69, "CD3OD": 64.71, "D2O": 64.88 } },
  ] },
  { id: "propylene", name: "Propylene", signals: [
    { group: "CH3", shifts: { "THF-d8": 19.27, "CD2Cl2": 19.47, "CDCl3": 19.5, "toluene-d8": 19.32, "C6D6": 19.38, "C6D5Cl": 19.32, "acetone-d6": 19.42, "DMSO-d6": 19.2, "CD3CN": 19.48, "TFE-d3": 19.63, "CD3OD": 19.5 } },
    { group: "CH2", shifts: { "THF-d8": 115.74, "CD2Cl2": 115.7, "CDCl3": 115.74, "toluene-d8": 115.89, "C6D6": 115.92, "C6D5Cl": 115.86, "acetone-d6": 116.03, "DMSO-d6": 116.07, "CD3CN": 116.12, "TFE-d3": 116.38, "CD3OD": 116.04 } },
    { group: "CH", shifts: { "THF-d8": 134.02, "CD2Cl2": 134.21, "CDCl3": 133.91, "toluene-d8": 133.61, "C6D6": 133.69, "C6D5Cl": 133.57, "acetone-d6": 134.34, "DMSO-d6": 133.55, "CD3CN": 134.78, "TFE-d3": 136.0, "CD3OD": 134.61 } },
  ] },
  { id: "pyridine", name: "Pyridine", signals: [
    { group: "CH(2,6)", shifts: { "THF-d8": 150.57, "CD2Cl2": 150.27, "CDCl3": 149.9, "toluene-d8": 150.25, "C6D6": 150.27, "C6D5Cl": 149.93, "acetone-d6": 150.67, "DMSO-d6": 149.58, "CD3CN": 150.76, "TFE-d3": 149.76, "CD3OD": 150.07, "D2O": 149.18 } },
    { group: "CH(3,5)", shifts: { "THF-d8": 124.08, "CD2Cl2": 124.06, "CDCl3": 123.75, "toluene-d8": 123.46, "C6D6": 123.58, "C6D5Cl": 123.49, "acetone-d6": 124.57, "DMSO-d6": 123.84, "CD3CN": 127.76, "TFE-d3": 126.27, "CD3OD": 125.53, "D2O": 125.12 } },
    { group: "CH(4)", shifts: { "THF-d8": 135.99, "CD2Cl2": 136.16, "CDCl3": 135.96, "toluene-d8": 135.17, "C6D6": 135.28, "C6D5Cl": 135.32, "acetone-d6": 136.56, "DMSO-d6": 136.05, "CD3CN": 136.89, "TFE-d3": 139.62, "CD3OD": 138.35, "D2O": 138.27 } },
  ] },
  { id: "pyrrole", name: "Pyrrole", signals: [
    { group: "CH(2,5)", shifts: { "THF-d8": 118.03, "CD2Cl2": 117.93, "CDCl3": 117.77, "toluene-d8": 117.61, "C6D6": 117.78, "C6D5Cl": 117.65, "acetone-d6": 117.98, "DMSO-d6": 117.32, "CD3CN": 118.47, "TFE-d3": 119.61, "CD3OD": 118.28, "D2O": 119.06 } },
    { group: "CH(3,4)", shifts: { "THF-d8": 107.74, "CD2Cl2": 108.02, "CDCl3": 107.98, "toluene-d8": 108.15, "C6D6": 108.21, "C6D5Cl": 108.03, "acetone-d6": 108.04, "DMSO-d6": 107.07, "CD3CN": 108.31, "TFE-d3": 108.85, "CD3OD": 108.11, "D2O": 107.83 } },
  ] },
  { id: "pyrrolidine", name: "Pyrrolidine", signals: [
    { group: "CH2(2,5)", shifts: { "THF-d8": 45.82, "CD2Cl2": 47.02, "CDCl3": 46.93, "toluene-d8": 47.12, "C6D6": 46.86, "C6D5Cl": 46.75, "DMSO-d6": 46.51, "CD3CN": 47.57, "TFE-d3": 47.43, "CD3OD": 47.23, "D2O": 46.83 } },
    { group: "CH2(3,4)", shifts: { "THF-d8": 26.17, "CD2Cl2": 25.83, "CDCl3": 25.56, "toluene-d8": 25.75, "C6D6": 25.65, "C6D5Cl": 25.59, "DMSO-d6": 25.26, "CD3CN": 26.34, "TFE-d3": 25.73, "CD3OD": 26.29, "D2O": 25.86 } },
  ] },
  { id: "silicone-grease", name: "Silicone grease", signals: [
    { group: "CH3", shifts: { "THF-d8": 1.2, "CD2Cl2": 1.22, "CDCl3": 1.19, "toluene-d8": 1.37, "C6D6": 1.38, "C6D5Cl": 1.09, "acetone-d6": 1.4, "TFE-d3": 2.87, "CD3OD": 2.1 } },
  ] },
  { id: "thf", name: "THF", signals: [
    { group: "CH2(2,5)", shifts: { "THF-d8": 68.03, "CD2Cl2": 68.16, "CDCl3": 67.97, "toluene-d8": 67.75, "C6D6": 67.8, "C6D5Cl": 67.64, "acetone-d6": 68.07, "DMSO-d6": 67.03, "CD3CN": 68.33, "TFE-d3": 69.53, "CD3OD": 68.83, "D2O": 68.68 } },
    { group: "CH2(3,4)", shifts: { "THF-d8": 26.19, "CD2Cl2": 25.98, "CDCl3": 25.62, "toluene-d8": 25.79, "C6D6": 25.72, "C6D5Cl": 25.68, "acetone-d6": 26.15, "DMSO-d6": 25.14, "CD3CN": 26.27, "TFE-d3": 26.69, "CD3OD": 26.48, "D2O": 25.67 } },
  ] },
  { id: "toluene", name: "Toluene", signals: [
    { group: "CH3", shifts: { "THF-d8": 21.29, "CD2Cl2": 21.53, "CDCl3": 21.46, "toluene-d8": 21.37, "C6D6": 21.1, "C6D5Cl": 21.23, "acetone-d6": 21.46, "DMSO-d6": 20.99, "CD3CN": 21.5, "TFE-d3": 21.62, "CD3OD": 21.5 } },
    { group: "C(1)", shifts: { "THF-d8": 138.24, "CD2Cl2": 138.36, "CDCl3": 137.89, "toluene-d8": 137.84, "C6D6": 137.91, "C6D5Cl": 137.65, "acetone-d6": 138.48, "DMSO-d6": 137.35, "CD3CN": 138.9, "TFE-d3": 139.92, "CD3OD": 138.85 } },
    { group: "CH(2,6)", shifts: { "THF-d8": 129.47, "CD2Cl2": 129.35, "CDCl3": 129.07, "toluene-d8": 129.33, "C6D6": 129.33, "C6D5Cl": 129.12, "acetone-d6": 129.76, "DMSO-d6": 128.88, "CD3CN": 129.94, "TFE-d3": 130.58, "CD3OD": 129.91 } },
    { group: "CH(3,5)", shifts: { "THF-d8": 128.71, "CD2Cl2": 128.54, "CDCl3": 128.26, "toluene-d8": 128.51, "C6D6": 128.56, "C6D5Cl": 128.31, "acetone-d6": 129.03, "DMSO-d6": 128.18, "CD3CN": 129.23, "TFE-d3": 129.79, "CD3OD": 129.2 } },
    { group: "CH(4)", shifts: { "THF-d8": 125.84, "CD2Cl2": 125.62, "CDCl3": 125.33, "toluene-d8": 125.66, "C6D6": 125.68, "C6D5Cl": 125.43, "acetone-d6": 126.12, "DMSO-d6": 125.29, "CD3CN": 126.28, "TFE-d3": 126.82, "CD3OD": 126.29 } },
  ] },
  { id: "triethylamine", name: "Et_{3}N", signals: [
    { group: "CH3", shifts: { "THF-d8": 12.51, "CD2Cl2": 12.12, "CDCl3": 11.61, "toluene-d8": 12.39, "C6D6": 12.35, "C6D5Cl": 11.87, "acetone-d6": 12.49, "DMSO-d6": 11.74, "CD3CN": 12.38, "TFE-d3": 9.51, "CD3OD": 11.09, "D2O": 9.07 } },
    { group: "CH2", shifts: { "THF-d8": 47.18, "CD2Cl2": 46.75, "CDCl3": 46.25, "toluene-d8": 46.82, "C6D6": 46.77, "C6D5Cl": 46.36, "acetone-d6": 47.07, "DMSO-d6": 45.74, "CD3CN": 47.1, "TFE-d3": 48.45, "CD3OD": 46.96, "D2O": 47.19 } },
  ] },
];
