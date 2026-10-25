export interface EvidenceFile {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  evidenceHash: string;
}

export interface EvidenceSubmission {
  scholarshipId: string;
  milestoneId: number;
  files: EvidenceFile[];
  combinedHash: string;
  observations: string;
  submittedAt: string;
  status: 'under_review';
}

// Almacenamiento temporal en memoria para la demo.
const submissions = new Map<string, EvidenceSubmission>();

const getKey = (scholarshipId: string, milestoneId: number) =>
  `${scholarshipId}:${milestoneId}`;

export function getEvidence(
  scholarshipId: string,
  milestoneId: number
): EvidenceSubmission | undefined {
  return submissions.get(getKey(scholarshipId, milestoneId));
}

export function saveEvidence(submission: EvidenceSubmission): void {
  submissions.set(
    getKey(submission.scholarshipId, submission.milestoneId),
    submission
  );
}

