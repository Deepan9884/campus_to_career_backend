/** 
 * Test script for Interview Module verification. 
 * Runs: start -> answer all -> finish 
 */ 
const http = require('http'); 
 
const BASE_URL = 'localhost'; 
const PORT = 5000; 
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2YTQ2MDc0YTIyMjBlMTdlYzc3ZDA3ZTciLCJlbWFpbCI6InRlc3R1c2VyQGV4YW1wbGUuY29tIiwibmFtZSI6IlRlc3QgVXNlciIsImlhdCI6MTc4Mjk3NTQxNiwiZXhwIjoxNzgyOTc2MzE2fQ.nAL_mlMDtlSP_fgLfbBoavSYN4Qt6D-Y-8Pv7-bRy1k'; 
 
function request(method, path, body) { 
  return new Promise((resolve, reject) => { 
    const opts = { 
      hostname: BASE_URL, 
      port: PORT, 
      path, 
      method, 
      headers: { 
        Authorization: 'Bearer ' + TOKEN, 
        'Content-Type': 'application/json', 
      }, 
    }; 
    const req = http.request(opts, (res) => { 
      let data = ''; 
      res.on('data', (chunk) => (data += chunk)); 
      res.on('end', () => { 
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: data }); } 
      }); 
    }); 
    req.on('error', reject); 
    if (body) req.write(JSON.stringify(body)); 
    req.end(); 
  }); 
} 
 
(async () => { 
  console.log('=== Full Session Flow Test ===\n'); 
  const answers = [ 
    'At my previous company, I had three projects with overlapping deadlines. I arranged a meeting with stakeholders to reassess priorities, used an impact-effort matrix, and negotiated extensions. We delivered all milestones successfully.', 
    'I disagreed with a teammate on architecture style. We presented our cases to the team, sought a third opinion, and chose a hybrid approach that worked for everyone.', 
    'I mentored a junior developer by daily pairing, setting learning goals, and giving feedback. Within three months they were shipping features independently.' 
  ]; 
  const startRes = await request('POST', '/api/interview/start', { domain: 'behavioral', questionCount: 3 }); 
  const interviewId = startRes.body.data._id; 
  console.log('1. POST /api/interview/start'); 
  console.log('   Status:', startRes.status); 
  console.log('   Interview ID:', interviewId); 
  console.log('   Questions:', startRes.body.data.questions.length); 
  console.log('   Status:', startRes.body.data.status); 
  for (let i = 0; i < startRes.body.data.questions.length; i++) { 
    const res = await request('POST', '/api/interview/' + interviewId + '/answer', { questionIndex: i, answer: answers[i] }); 
    console.log('2.' + (i+1) + '. POST /api/interview/' + interviewId + '/answer ->', res.status); 
  } 
  const finishRes = await request('POST', '/api/interview/' + interviewId + '/finish'); 
  console.log('3. POST /api/interview/' + interviewId + '/finish'); 
  console.log('   Status:', finishRes.status); 
  console.log('   Overall score:', finishRes.body.data?.overallScore); 
  console.log('   Status:', finishRes.body.data?.status); 
  console.log('   Strengths count:', (finishRes.body.data?.strengths || []).length); 
  console.log('   Improvements count:', (finishRes.body.data?.improvements || []).length); 
  console.log('   Summary:', (finishRes.body.data?.summary || '').substring(0, 100)); 
  console.log('   CompletedAt:', finishRes.body.data?.completedAt); 
  console.log('\n=== Test Complete ==='); 
})(); 
