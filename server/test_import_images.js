import fetch from 'node-fetch';

async function testImport() {
    const bulkText = `
1. Question 1
[IMG: https://example.com/img1.jpg]
A) Option A
*B) Option B

[IMG: https://example.com/img2.jpg]
2. Question 2
*True
False

3. Question 3
[IMG: https://example.com/img3.jpg]
Answer: Short Answer Demo
`;

    // Create import request
    const res = await fetch('http://localhost:3001/api/quizzes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: 'Test Quiz Multiple Images',
            description: 'Testing image parses',
            bulkText: bulkText,
            authorId: 1 // assuming user 1 exists
        })
    });

    const data = await res.json();
    console.log("Import response:", data);

    if (data.quizId) {
        // Fetch the quiz to verify questions
        const quizRes = await fetch(`http://localhost:3001/api/quizzes/${data.quizId}`);
        const quizData = await quizRes.json();

        console.log("Questions parsed:");
        quizData.questions.forEach((q, i) => {
            console.log(`Q${i + 1}: ${q.text} | Image: ${q.image_url}`);
        });

        // Assertions
        if (quizData.questions[0].image_url === 'https://example.com/img1.jpg' &&
            quizData.questions[1].image_url === 'https://example.com/img2.jpg' &&
            quizData.questions[2].image_url === 'https://example.com/img3.jpg') {
            console.log('✅ TEST PASSED: All images correctly assigned!');
            process.exit(0);
        } else {
            console.error('❌ TEST FAILED: Images not assigned correctly!');
            process.exit(1);
        }
    } else {
        console.error('❌ TEST FAILED: Import failed!');
        process.exit(1);
    }
}

testImport().catch(console.error);
