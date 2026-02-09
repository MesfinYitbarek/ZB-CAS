const Result = require('../models/Result');
const Report = require('../models/Report');
const Assessment = require('../models/Assessment');

const generateReportsForAssessment = async (assessmentId) => {

  // Get all FINAL results for this assessment
  const results = await Result.find({
    assessmentId,
    status: 'FINAL'
  })
    .populate('userId', 'name department position email')
    .populate('competencyId', 'name')
    .lean();

  if (!results.length) return;

  const reports = results.map(result => ({

    user: {
      userId: result.userId._id,
      name: result.userId.name,
      department: result.userId.department || '',
      position: result.userId.position || '',
      email: result.userId.email || ''
    },

    competencyName: result.competencyId?.name || 'Unknown',
    competencyId: result.competencyId?._id,

    assessmentId: result.assessmentId,

    finalScore: result.finalScore,

    level: result.level,

    recommendation: result.recommendation || '',

    generatedAt: new Date()

  }));

  // Prevent duplicate reports
  await Report.insertMany(reports, {
    ordered: false
  }).catch(err => {
    // ignore duplicate key errors safely
    if (err.code !== 11000) throw err;
  });

};

module.exports = {
  generateReportsForAssessment
};
