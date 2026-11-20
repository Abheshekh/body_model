// Effort engine types (PLAN §2b.5). Pure: no three.js. SI units (m, kg, N, Nm).
import type { Pose } from '../rig/pose';

export type Vec3 = [number, number, number];
export type Sex = 'male' | 'female';

/** Body points (§2b.3). Plural names (hands, foot, shin, shoulders) are two points; a load there is split. */
export type BodyPoint =
  | 'hand_l' | 'hand_r' | 'hands' | 'foot_l' | 'foot_r' | 'foot' | 'heel_l' | 'heel_r' | 'pelvis' | 'thoraxBack'
  | 'hipsFront' | 'pelvisBack' | 'chest' | 'shoulderBack' | 'knee_l' | 'knee_r' | 'elbow_l' | 'elbow_r'
  | 'shin_l' | 'shin_r' | 'shin' | 'shoulder_l' | 'shoulder_r' | 'shoulders' | 'thigh_l' | 'thigh_r' | 'forearm_l' | 'forearm_r';

export interface Force { at: Vec3; f: Vec3; bone: string; kind: 'gravity' | 'load' | 'reaction' }
export interface Load { id: string; kind: 'free' | 'cable' | 'band' | 'machine'; kg: number; at: BodyPoint; toward?: Vec3; track?: Vec3 }
export interface Support { point: BodyPoint; normal: Vec3 }

/** segments.json `segments` (PLAN §5). */
export type Segments = Record<string, { bones: string[]; massFraction: number; comFraction: number; from: 'head' | 'tail' }>;

export interface Geometry {
  sex: Sex;
  massKg: number;
  /** the pose this geometry was built from (joint axes depend on the current angles) */
  pose: Pose;
  bones: Record<string, { mass: number; com: Vec3; head: Vec3; tail: Vec3; Rw: number[] }>;
  point(name: BodyPoint): Vec3;
  joint(key: string): Vec3;
  /** bones on the far side of joint `key`, the joint's own bone first */
  distal(key: string): string[];
}

export interface Balance { comOverFeet: boolean; margin: number }

export interface EffortInput { pose: Pose; sex: Sex; massKg?: number; loads: Load[]; supports: Support[]; poseB?: Pose }

export type Reason =
  | { kind: 'joint'; joint: string; axis: string; dir: '+' | '-'; demand: number; loadKg?: number }
  | { kind: 'rule'; rule: 'scapula' | 'grip' | 'bracing'; value: number };

export interface MuscleResult { level: number; role: 'work' | 'help' | 'hold' | 'none'; reasons: Reason[] }

export interface EffortResult {
  jointDemand: Record<string, Record<string, { plus: number; minus: number }>>;
  muscle: Record<number, MuscleResult>;
  lowerBack: { momentNm: number; level: number };
  balance: Balance;
  warnings: string[];
}
