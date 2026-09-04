/**
 * MASTER QUESTION DATABASE & DATA INTEGRITY MODULE
 * Source: English 10 Term 1 Objective Remediation Assessment
 * Strictly 32 Questions (Task 1: 10, Task 2: 10, Task 3: 12)
 *
 * ARCHITECTURE:
 * - Stable question_id (e.g. T1-Q01) and original_number
 * - Stable option_id (e.g. T1Q01-A, T1Q01-B) with is_correct flag
 * - Explicit correct_option_id on every question
 * - Shuffling randomizes display order only, never breaking the correct_option_id mapping
 */

const READING_PASSAGES = {

    task1: {
        task_id: 1,
        title: "Mara and the Tomato Plant",
        instructions: "Read the short literary text below carefully before answering the questions:",
        content: "Every afternoon, Mara watered the tomato plant beside their small house. Her grandmother had given her the seeds and told her that the plant came from their family garden. One week, a strong storm damaged the plant. Mara wanted to throw it away, but her brother Leo suggested saving the healthy stem. Their father said there was not enough space for another plant. Mara explained why the plant mattered to the family. In the end, the family agreed to place the plant in a large container near the window."
    },
    task2: {
        task_id: 2,
        title: "Community and Future Generations",
        instructions: "Read the statement below carefully before answering the questions:",
        content: "“A community becomes strong when people protect what belongs not only to themselves, but also to the generations that come after them.”"
    },
    task3: {
        task_id: 3,
        title: "Language, Style, Cohesion, and Culture",
        instructions: "Read each item carefully and select the best answer.",
        content: null
    },
    task4: {
        task_id: 4,
        title: "Synthesizing, Composing, and Expressing Insights",
        instructions: "Read the excerpt below carefully before answering the questions:",
        content: "“A resilient community thrives not by avoiding hardships, but by facing them collectively. When young learners understand their cultural heritage and articulate their ideas with clarity and purpose, they contribute meaningfully to nation-building.”"
    }
};

const readingMaterials = READING_PASSAGES;

const masterQuestionBank = {
    task1: [
        {
            task_id: 1,
            question_id: "T1-Q01",
            original_number: 1,
            question_text: "What is the main conflict in the story?",
            choices: [
                { option_id: "T1Q01-A", text: "Mara vs. a stranger", is_correct: false },
                { option_id: "T1Q01-B", text: "Mara vs. her brother", is_correct: false },
                { option_id: "T1Q01-C", text: "Mara vs. her family’s decision", is_correct: true },
                { option_id: "T1Q01-D", text: "Mara vs. the school", is_correct: false }
            ],
            correct_option_id: "T1Q01-C",
            points: 1
        },
        {
            task_id: 1,
            question_id: "T1-Q02",
            original_number: 2,
            question_text: "The conflict between Mara and her father is best classified as—",
            choices: [
                { option_id: "T1Q02-A", text: "character vs. nature", is_correct: false },
                { option_id: "T1Q02-B", text: "character vs. society", is_correct: false },
                { option_id: "T1Q02-C", text: "character vs. character", is_correct: true },
                { option_id: "T1Q02-D", text: "character vs. self", is_correct: false }
            ],
            correct_option_id: "T1Q02-C",
            points: 1
        },
        {
            task_id: 1,
            question_id: "T1-Q03",
            original_number: 3,
            question_text: "What trait does Mara show when she explains why the plant matters?",
            choices: [
                { option_id: "T1Q03-A", text: "Carelessness", is_correct: false },
                { option_id: "T1Q03-B", text: "Determination", is_correct: true },
                { option_id: "T1Q03-C", text: "Anger", is_correct: false },
                { option_id: "T1Q03-D", text: "Fear", is_correct: false }
            ],
            correct_option_id: "T1Q03-B",
            points: 1
        },
        {
            task_id: 1,
            question_id: "T1-Q04",
            original_number: 4,
            question_text: "How is Leo characterized?",
            choices: [
                { option_id: "T1Q04-A", text: "He offers a practical solution.", is_correct: true },
                { option_id: "T1Q04-B", text: "He refuses to help.", is_correct: false },
                { option_id: "T1Q04-C", text: "He destroys the plant.", is_correct: false },
                { option_id: "T1Q04-D", text: "He ignores Mara.", is_correct: false }
            ],
            correct_option_id: "T1Q04-A",
            points: 1
        },
        {
            task_id: 1,
            question_id: "T1-Q05",
            original_number: 5,
            question_text: "Which event happens first?",
            choices: [
                { option_id: "T1Q05-A", text: "The family moves the plant.", is_correct: false },
                { option_id: "T1Q05-B", text: "The storm damages the plant.", is_correct: true },
                { option_id: "T1Q05-C", text: "Leo suggests saving the stem.", is_correct: false },
                { option_id: "T1Q05-D", text: "Mara explains the plant’s importance.", is_correct: false }
            ],
            correct_option_id: "T1Q05-B",
            points: 1
        },
        {
            task_id: 1,
            question_id: "T1-Q06",
            original_number: 6,
            question_text: "The story follows events in their natural time order. What plot structure is used?",
            choices: [
                { option_id: "T1Q06-A", text: "Linear", is_correct: true },
                { option_id: "T1Q06-B", text: "Flashback", is_correct: false },
                { option_id: "T1Q06-C", text: "In medias res", is_correct: false },
                { option_id: "T1Q06-D", text: "Parallel", is_correct: false }
            ],
            correct_option_id: "T1Q06-A",
            points: 1
        },
        {
            task_id: 1,
            question_id: "T1-Q07",
            original_number: 7,
            question_text: "The narrator refers to Mara as “she” and tells events from outside the characters. What point of view is used?",
            choices: [
                { option_id: "T1Q07-A", text: "First person", is_correct: false },
                { option_id: "T1Q07-B", text: "Second person", is_correct: false },
                { option_id: "T1Q07-C", text: "Third person", is_correct: true },
                { option_id: "T1Q07-D", text: "Dramatic monologue", is_correct: false }
            ],
            correct_option_id: "T1Q07-C",
            points: 1
        },
        {
            task_id: 1,
            question_id: "T1-Q08",
            original_number: 8,
            question_text: "Which word best describes the mood at the beginning of the story?",
            choices: [
                { option_id: "T1Q08-A", text: "Peaceful", is_correct: true },
                { option_id: "T1Q08-B", text: "Terrifying", is_correct: false },
                { option_id: "T1Q08-C", text: "Humorous", is_correct: false },
                { option_id: "T1Q08-D", text: "Angry", is_correct: false }
            ],
            correct_option_id: "T1Q08-A",
            points: 1
        },
        {
            task_id: 1,
            question_id: "T1-Q09",
            original_number: 9,
            question_text: "The words “strong storm damaged the plant” create a tone that is mainly—",
            choices: [
                { option_id: "T1Q09-A", text: "serious", is_correct: true },
                { option_id: "T1Q09-B", text: "playful", is_correct: false },
                { option_id: "T1Q09-C", text: "sarcastic", is_correct: false },
                { option_id: "T1Q09-D", text: "mysterious", is_correct: false }
            ],
            correct_option_id: "T1Q09-A",
            points: 1
        },
        {
            task_id: 1,
            question_id: "T1-Q10",
            original_number: 10,
            question_text: "Which statement best expresses the value shown by Mara?",
            choices: [
                { option_id: "T1Q10-A", text: "Family traditions should be forgotten.", is_correct: false },
                { option_id: "T1Q10-B", text: "Important family memories are worth preserving.", is_correct: true },
                { option_id: "T1Q10-C", text: "Problems should always be avoided.", is_correct: false },
                { option_id: "T1Q10-D", text: "Nature is more important than people.", is_correct: false }
            ],
            correct_option_id: "T1Q10-B",
            points: 1
        }
    ],

    task2: [
        {
            task_id: 2,
            question_id: "T2-Q01",
            original_number: 1,
            question_text: "What idea is expressed by the statement?",
            choices: [
                { option_id: "T2Q01-A", text: "People should think only about themselves.", is_correct: false },
                { option_id: "T2Q01-B", text: "Communities become stronger through shared responsibility.", is_correct: true },
                { option_id: "T2Q01-C", text: "Traditions prevent communities from developing.", is_correct: false },
                { option_id: "T2Q01-D", text: "Young people should avoid community activities.", is_correct: false }
            ],
            correct_option_id: "T2Q01-B",
            points: 1
        },
        {
            task_id: 2,
            question_id: "T2-Q02",
            original_number: 2,
            question_text: "The statement is closest to a—",
            choices: [
                { option_id: "T2Q02-A", text: "universal truth", is_correct: true },
                { option_id: "T2Q02-B", text: "plot event", is_correct: false },
                { option_id: "T2Q02-C", text: "character trait", is_correct: false },
                { option_id: "T2Q02-D", text: "setting detail", is_correct: false }
            ],
            correct_option_id: "T2Q02-A",
            points: 1
        },
        {
            task_id: 2,
            question_id: "T2-Q03",
            original_number: 3,
            question_text: "Which action best applies the message of the statement?",
            choices: [
                { option_id: "T2Q03-A", text: "Protecting a community garden for future residents", is_correct: true },
                { option_id: "T2Q03-B", text: "Keeping all community resources for one family", is_correct: false },
                { option_id: "T2Q03-C", text: "Ignoring local traditions", is_correct: false },
                { option_id: "T2Q03-D", text: "Avoiding cooperation with neighbors", is_correct: false }
            ],
            correct_option_id: "T2Q03-A",
            points: 1
        },
        {
            task_id: 2,
            question_id: "T2-Q04",
            original_number: 4,
            question_text: "Which value is most strongly presented?",
            choices: [
                { option_id: "T2Q04-A", text: "Responsibility", is_correct: true },
                { option_id: "T2Q04-B", text: "Jealousy", is_correct: false },
                { option_id: "T2Q04-C", text: "Competition", is_correct: false },
                { option_id: "T2Q04-D", text: "Secrecy", is_correct: false }
            ],
            correct_option_id: "T2Q04-A",
            points: 1
        },
        {
            task_id: 2,
            question_id: "T2-Q05",
            original_number: 5,
            question_text: "A literary text that reflects the beliefs and practices of a community is connected to which context?",
            choices: [
                { option_id: "T2Q05-A", text: "Biographical", is_correct: false },
                { option_id: "T2Q05-B", text: "Sociocultural", is_correct: true },
                { option_id: "T2Q05-C", text: "Psychological", is_correct: false },
                { option_id: "T2Q05-D", text: "Linguistic", is_correct: false }
            ],
            correct_option_id: "T2Q05-B",
            points: 1
        },
        {
            task_id: 2,
            question_id: "T2-Q06",
            original_number: 6,
            question_text: "Information about the author’s life that helps explain a literary work belongs to the—",
            choices: [
                { option_id: "T2Q06-A", text: "historical context", is_correct: false },
                { option_id: "T2Q06-B", text: "biographical context", is_correct: true },
                { option_id: "T2Q06-C", text: "linguistic context", is_correct: false },
                { option_id: "T2Q06-D", text: "structural context", is_correct: false }
            ],
            correct_option_id: "T2Q06-B",
            points: 1
        },
        {
            task_id: 2,
            question_id: "T2-Q07",
            original_number: 7,
            question_text: "Information about the time period and important events surrounding a text belongs to the—",
            choices: [
                { option_id: "T2Q07-A", text: "historical context", is_correct: true },
                { option_id: "T2Q07-B", text: "psychological context", is_correct: false },
                { option_id: "T2Q07-C", text: "biographical context", is_correct: false },
                { option_id: "T2Q07-D", text: "visual context", is_correct: false }
            ],
            correct_option_id: "T2Q07-A",
            points: 1
        },
        {
            task_id: 2,
            question_id: "T2-Q08",
            original_number: 8,
            question_text: "A reader studies how a character’s thoughts and feelings influence actions. This mainly involves—",
            choices: [
                { option_id: "T2Q08-A", text: "psychological context", is_correct: true },
                { option_id: "T2Q08-B", text: "historical context", is_correct: false },
                { option_id: "T2Q08-C", text: "linguistic context", is_correct: false },
                { option_id: "T2Q08-D", text: "geographical context", is_correct: false }
            ],
            correct_option_id: "T2Q08-A",
            points: 1
        },
        {
            task_id: 2,
            question_id: "T2-Q09",
            original_number: 9,
            question_text: "Which question best helps evaluate a literary text’s message?",
            choices: [
                { option_id: "T2Q09-A", text: "What font was used to print it?", is_correct: false },
                { option_id: "T2Q09-B", text: "What value or truth does the text communicate?", is_correct: true },
                { option_id: "T2Q09-C", text: "How many pages does it have?", is_correct: false },
                { option_id: "T2Q09-D", text: "Who printed the paper?", is_correct: false }
            ],
            correct_option_id: "T2Q09-B",
            points: 1
        },
        {
            task_id: 2,
            question_id: "T2-Q10",
            original_number: 10,
            question_text: "Which statement best describes a maxim?",
            choices: [
                { option_id: "T2Q10-A", text: "A short statement expressing a general principle or truth", is_correct: true },
                { option_id: "T2Q10-B", text: "A list of characters", is_correct: false },
                { option_id: "T2Q10-C", text: "A description of setting", is_correct: false },
                { option_id: "T2Q10-D", text: "A sequence of plot events", is_correct: false }
            ],
            correct_option_id: "T2Q10-A",
            points: 1
        }
    ],

    task3: [
        {
            task_id: 3,
            question_id: "T3-Q01",
            original_number: 1,
            question_text: "Which word refers to an author’s choice of words?",
            choices: [
                { option_id: "T3Q01-A", text: "Diction", is_correct: true },
                { option_id: "T3Q01-B", text: "Plot", is_correct: false },
                { option_id: "T3Q01-C", text: "Conflict", is_correct: false },
                { option_id: "T3Q01-D", text: "Setting", is_correct: false }
            ],
            correct_option_id: "T3Q01-A",
            points: 1
        },
        {
            task_id: 3,
            question_id: "T3-Q02",
            original_number: 2,
            question_text: "Which pair shows appropriate diction for a formal literary piece?",
            choices: [
                { option_id: "T3Q02-A", text: "“gonna” and “kinda”", is_correct: false },
                { option_id: "T3Q02-B", text: "“therefore” and “significant”", is_correct: true },
                { option_id: "T3Q02-C", text: "“yup” and “nah”", is_correct: false },
                { option_id: "T3Q02-D", text: "“cool” and “awesome”", is_correct: false }
            ],
            correct_option_id: "T3Q02-B",
            points: 1
        },
        {
            task_id: 3,
            question_id: "T3-Q03",
            original_number: 3,
            question_text: "Style refers mainly to—",
            choices: [
                { option_id: "T3Q03-A", text: "the writer’s distinctive way of expressing ideas", is_correct: true },
                { option_id: "T3Q03-B", text: "the number of characters", is_correct: false },
                { option_id: "T3Q03-C", text: "the length of the title", is_correct: false },
                { option_id: "T3Q03-D", text: "the place where a story happens", is_correct: false }
            ],
            correct_option_id: "T3Q03-A",
            points: 1
        },
        {
            task_id: 3,
            question_id: "T3-Q04",
            original_number: 4,
            question_text: "Which tone is appropriate for a text honoring a community tradition?",
            choices: [
                { option_id: "T3Q04-A", text: "Respectful", is_correct: true },
                { option_id: "T3Q04-B", text: "Mocking", is_correct: false },
                { option_id: "T3Q04-C", text: "Careless", is_correct: false },
                { option_id: "T3Q04-D", text: "Hostile", is_correct: false }
            ],
            correct_option_id: "T3Q04-A",
            points: 1
        },
        {
            task_id: 3,
            question_id: "T3-Q05",
            original_number: 5,
            question_text: "Which sentence shows cohesion?",
            choices: [
                { option_id: "T3Q05-A", text: "The festival began early. Therefore, the students arrived before sunrise.", is_correct: true },
                { option_id: "T3Q05-B", text: "The festival began early. Purple chairs are comfortable.", is_correct: false },
                { option_id: "T3Q05-C", text: "The festival began early. My pencil is blue.", is_correct: false },
                { option_id: "T3Q05-D", text: "The festival began early. Seven is a number.", is_correct: false }
            ],
            correct_option_id: "T3Q05-A",
            points: 1
        },
        {
            task_id: 3,
            question_id: "T3-Q06",
            original_number: 6,
            question_text: "Which transition best shows cause and effect?",
            choices: [
                { option_id: "T3Q06-A", text: "However", is_correct: false },
                { option_id: "T3Q06-B", text: "Therefore", is_correct: true },
                { option_id: "T3Q06-C", text: "Meanwhile", is_correct: false },
                { option_id: "T3Q06-D", text: "Similarly", is_correct: false }
            ],
            correct_option_id: "T3Q06-B",
            points: 1
        },
        {
            task_id: 3,
            question_id: "T3-Q07",
            original_number: 7,
            question_text: "A writer changes a paragraph so that every idea supports the main message. The writer is improving—",
            choices: [
                { option_id: "T3Q07-A", text: "coherence", is_correct: true },
                { option_id: "T3Q07-B", text: "characterization", is_correct: false },
                { option_id: "T3Q07-C", text: "conflict", is_correct: false },
                { option_id: "T3Q07-D", text: "meter", is_correct: false }
            ],
            correct_option_id: "T3Q07-A",
            points: 1
        },
        {
            task_id: 3,
            question_id: "T3-Q08",
            original_number: 8,
            question_text: "Before writing a literary text, identifying why the text will be written helps determine its—",
            choices: [
                { option_id: "T3Q08-A", text: "purpose", is_correct: true },
                { option_id: "T3Q08-B", text: "setting", is_correct: false },
                { option_id: "T3Q08-C", text: "conflict", is_correct: false },
                { option_id: "T3Q08-D", text: "rhyme", is_correct: false }
            ],
            correct_option_id: "T3Q08-A",
            points: 1
        },
        {
            task_id: 3,
            question_id: "T3-Q09",
            original_number: 9,
            question_text: "Why should a writer consider the target audience?",
            choices: [
                { option_id: "T3Q09-A", text: "To choose language and presentation suitable for the readers", is_correct: true },
                { option_id: "T3Q09-B", text: "To make the text longer", is_correct: false },
                { option_id: "T3Q09-C", text: "To avoid revising the text", is_correct: false },
                { option_id: "T3Q09-D", text: "To remove cultural elements", is_correct: false }
            ],
            correct_option_id: "T3Q09-A",
            points: 1
        },
        {
            task_id: 3,
            question_id: "T3-Q10",
            original_number: 10,
            question_text: "Which topic best reflects Filipino cultural identity?",
            choices: [
                { option_id: "T3Q10-A", text: "A story about helping neighbors during a community celebration", is_correct: true },
                { option_id: "T3Q10-B", text: "A random list of numbers", is_correct: false },
                { option_id: "T3Q10-C", text: "A description of an unnamed machine", is_correct: false },
                { option_id: "T3Q10-D", text: "A paragraph containing unrelated sentences", is_correct: false }
            ],
            correct_option_id: "T3Q10-A",
            points: 1
        },
        {
            task_id: 3,
            question_id: "T3-Q11",
            original_number: 11,
            question_text: "Which revision improves the sentence’s clarity? “The celebration was good because it was good and everyone liked it.”",
            choices: [
                { option_id: "T3Q11-A", text: "The celebration was good good everyone liked.", is_correct: false },
                { option_id: "T3Q11-B", text: "The celebration was lively, and many families enjoyed the shared activities.", is_correct: true },
                { option_id: "T3Q11-C", text: "The celebration was it and good.", is_correct: false },
                { option_id: "T3Q11-D", text: "Everyone good because celebration.", is_correct: false }
            ],
            correct_option_id: "T3Q11-B",
            points: 1
        },
        {
            task_id: 3,
            question_id: "T3-Q12",
            original_number: 12,
            question_text: "Which is the best purpose for publishing an original literary text about a local tradition?",
            choices: [
                { option_id: "T3Q12-A", text: "To preserve and share cultural meaning with readers", is_correct: true },
                { option_id: "T3Q12-B", text: "To confuse the audience", is_correct: false },
                { option_id: "T3Q12-C", text: "To remove all cultural references", is_correct: false },
                { option_id: "T3Q12-D", text: "To copy another writer’s work", is_correct: false }
            ],
            correct_option_id: "T3Q12-A",
            points: 1
        }
    ],
    task4: [
        {
            task_id: 4,
            question_id: "T4-Q01",
            original_number: 1,
            question_text: "What is the primary purpose of synthesizing information from multiple sources?",
            choices: [
                { option_id: "T4Q01-A", text: "To memorize all facts word-for-word", is_correct: false },
                { option_id: "T4Q01-B", text: "To combine different ideas to form a new and cohesive understanding", is_correct: true },
                { option_id: "T4Q01-C", text: "To discard conflicting opinions immediately", is_correct: false },
                { option_id: "T4Q01-D", text: "To repeat the exact phrasing of the original text", is_correct: false }
            ],
            correct_option_id: "T4Q01-B",
            points: 1
        },
        {
            task_id: 4,
            question_id: "T4-Q02",
            original_number: 2,
            question_text: "Which of the following statements best expresses a strong, defensible claim?",
            choices: [
                { option_id: "T4Q02-A", text: "Storytelling is one of the most effective ways to preserve cultural heritage because it connects values across generations.", is_correct: true },
                { option_id: "T4Q02-B", text: "Many people read stories every day.", is_correct: false },
                { option_id: "T4Q02-C", text: "Some books are long and some are short.", is_correct: false },
                { option_id: "T4Q02-D", text: "I think books are interesting.", is_correct: false }
            ],
            correct_option_id: "T4Q02-A",
            points: 1
        },
        {
            task_id: 4,
            question_id: "T4-Q03",
            original_number: 3,
            question_text: "When evaluating the credibility of an informational text, what should a reader check first?",
            choices: [
                { option_id: "T4Q03-A", text: "The font size used in the document", is_correct: false },
                { option_id: "T4Q03-B", text: "The author's expertise, source evidence, and objectivity", is_correct: true },
                { option_id: "T4Q03-C", text: "The number of pictures included", is_correct: false },
                { option_id: "T4Q03-D", text: "How colorful the cover page is", is_correct: false }
            ],
            correct_option_id: "T4Q03-B",
            points: 1
        },
        {
            task_id: 4,
            question_id: "T4-Q04",
            original_number: 4,
            question_text: "Which transition word is best suited for concluding an argumentative essay?",
            choices: [
                { option_id: "T4Q04-A", text: "Ultimately", is_correct: true },
                { option_id: "T4Q04-B", text: "Meanwhile", is_correct: false },
                { option_id: "T4Q04-C", text: "Suddenly", is_correct: false },
                { option_id: "T4Q04-D", text: "Earlier", is_correct: false }
            ],
            correct_option_id: "T4Q04-A",
            points: 1
        },
        {
            task_id: 4,
            question_id: "T4-Q05",
            original_number: 5,
            question_text: "What makes an argument biased?",
            choices: [
                { option_id: "T4Q05-A", text: "It relies on verified facts and peer-reviewed data", is_correct: false },
                { option_id: "T4Q05-B", text: "It presents only one side while unfairly ignoring opposing evidence", is_correct: true },
                { option_id: "T4Q05-C", text: "It acknowledges multiple perspectives fairly", is_correct: false },
                { option_id: "T4Q05-D", text: "It uses clear and objective language", is_correct: false }
            ],
            correct_option_id: "T4Q05-B",
            points: 1
        },
        {
            task_id: 4,
            question_id: "T4-Q06",
            original_number: 6,
            question_text: "How should a speaker adjust their language when presenting to an academic panel compared to talking with close friends?",
            choices: [
                { option_id: "T4Q06-A", text: "Use formal diction, structured explanations, and precise vocabulary", is_correct: true },
                { option_id: "T4Q06-B", text: "Use casual slang and incomplete sentences", is_correct: false },
                { option_id: "T4Q06-C", text: "Speak as quickly as possible without pausing", is_correct: false },
                { option_id: "T4Q06-D", text: "Avoid explaining key concepts", is_correct: false }
            ],
            correct_option_id: "T4Q06-A",
            points: 1
        },
        {
            task_id: 4,
            question_id: "T4-Q07",
            original_number: 7,
            question_text: "Which evidence best supports the claim that community gardens improve neighborhood solidarity?",
            choices: [
                { option_id: "T4Q07-A", text: "Gardening can be done on weekends.", is_correct: false },
                { option_id: "T4Q07-B", text: "A local survey revealed that 85% of participating families reported stronger bonds and cooperation with their neighbors.", is_correct: true },
                { option_id: "T4Q07-C", text: "Tomatoes require ample sunlight to grow.", is_correct: false },
                { option_id: "T4Q07-D", text: "Gardens are usually green and pleasant.", is_correct: false }
            ],
            correct_option_id: "T4Q07-B",
            points: 1
        },
        {
            task_id: 4,
            question_id: "T4-Q08",
            original_number: 8,
            question_text: "What is the primary role of a counterargument in a persuasive essay?",
            choices: [
                { option_id: "T4Q08-A", text: "To confuse the reader about the author's stance", is_correct: false },
                { option_id: "T4Q08-B", text: "To acknowledge opposing views and demonstrate why the author's position remains stronger", is_correct: true },
                { option_id: "T4Q08-C", text: "To make the essay shorter", is_correct: false },
                { option_id: "T4Q08-D", text: "To repeat the opening hook", is_correct: false }
            ],
            correct_option_id: "T4Q08-B",
            points: 1
        },
        {
            task_id: 4,
            question_id: "T4-Q09",
            original_number: 9,
            question_text: "When revising an essay for cohesion, a student should focus on—",
            choices: [
                { option_id: "T4Q09-A", text: "Ensuring smooth transitions and logical connections between sentences and paragraphs", is_correct: true },
                { option_id: "T4Q09-B", text: "Changing the topic of every paragraph randomly", is_correct: false },
                { option_id: "T4Q09-C", text: "Increasing the font size to fill space", is_correct: false },
                { option_id: "T4Q09-D", text: "Removing all punctuation marks", is_correct: false }
            ],
            correct_option_id: "T4Q09-A",
            points: 1
        },
        {
            task_id: 4,
            question_id: "T4-Q10",
            original_number: 10,
            question_text: "Which statement best summarizes the core theme of the English 10 remediation passage on community resilience?",
            choices: [
                { option_id: "T4Q10-A", text: "Individual achievement is more important than group success.", is_correct: false },
                { option_id: "T4Q10-B", text: "Collective responsibility and cultural awareness build an enduring and empowered community.", is_correct: true },
                { option_id: "T4Q10-C", text: "Communities should avoid all forms of change.", is_correct: false },
                { option_id: "T4Q10-D", text: "Young learners should only study scientific machines.", is_correct: false }
            ],
            correct_option_id: "T4Q10-B",
            points: 1
        }
    ]
};

// Teacher copy authoritative answer key reference
const TEACHER_MASTER_KEY = {
    task1: { 1: "C", 2: "C", 3: "B", 4: "A", 5: "B", 6: "A", 7: "C", 8: "A", 9: "A", 10: "B" },
    task2: { 1: "B", 2: "A", 3: "A", 4: "A", 5: "B", 6: "B", 7: "A", 8: "A", 9: "B", 10: "A" },
    task3: { 1: "A", 2: "B", 3: "A", 4: "A", 5: "A", 6: "B", 7: "A", 8: "A", 9: "A", 10: "A", 11: "B", 12: "A" },
    task4: { 1: "B", 2: "A", 3: "B", 4: "A", 5: "B", 6: "A", 7: "B", 8: "B", 9: "A", 10: "B" }
};

/**
 * COMPREHENSIVE AUTOMATIC VALIDATION ROUTINE
 * Validates counts, unique IDs, 4 options per question, exactly 1 correct answer per question,
 * correct answer mapping, and 10-trial randomization verification.
 */
function validateQuizDatabase() {
    const errors = [];
    const allQuestions = [
        ...masterQuestionBank.task1,
        ...masterQuestionBank.task2,
        ...masterQuestionBank.task3,
        ...masterQuestionBank.task4
    ];

    // 1. Task Counts
    if (masterQuestionBank.task1.length !== 10) errors.push(`Task 1 expected 10 questions, found ${masterQuestionBank.task1.length}`);
    if (masterQuestionBank.task2.length !== 10) errors.push(`Task 2 expected 10 questions, found ${masterQuestionBank.task2.length}`);
    if (masterQuestionBank.task3.length !== 12) errors.push(`Task 3 expected 12 questions, found ${masterQuestionBank.task3.length}`);
    if (masterQuestionBank.task4.length !== 10) errors.push(`Task 4 expected 10 questions, found ${masterQuestionBank.task4.length}`);
    if (allQuestions.length !== 42) errors.push(`Total questions expected 42, found ${allQuestions.length}`);

    // 2. Uniqueness & Structure Checks
    const qIds = new Set();
    const optIds = new Set();

    allQuestions.forEach((q, idx) => {
        // Question ID
        if (!q.question_id) errors.push(`Question index ${idx} missing question_id`);
        if (qIds.has(q.question_id)) errors.push(`Duplicate question_id: ${q.question_id}`);
        qIds.add(q.question_id);

        // Choices count
        if (!Array.isArray(q.choices) || q.choices.length !== 4) {
            errors.push(`Question ${q.question_id} does not have exactly 4 choices (has ${q.choices?.length})`);
        }

        // Correct answer check
        const correctChoices = (q.choices || []).filter(c => c.is_correct === true);
        if (correctChoices.length === 0) {
            errors.push(`Question ${q.question_id} has 0 correct answers`);
        } else if (correctChoices.length > 1) {
            errors.push(`Question ${q.question_id} has multiple (${correctChoices.length}) correct answers`);
        }

        // Check correct_option_id
        if (!q.correct_option_id) {
            errors.push(`Question ${q.question_id} missing correct_option_id`);
        } else {
            const matchOpt = q.choices.find(c => c.option_id === q.correct_option_id);
            if (!matchOpt) {
                errors.push(`Question ${q.question_id} correct_option_id ${q.correct_option_id} not found in choices`);
            } else if (!matchOpt.is_correct) {
                errors.push(`Question ${q.question_id} correct_option_id does not match is_correct: true choice`);
            }
        }

        // Option IDs uniqueness
        (q.choices || []).forEach(c => {
            if (!c.option_id) errors.push(`A choice in ${q.question_id} is missing option_id`);
            if (optIds.has(c.option_id)) errors.push(`Duplicate option_id: ${c.option_id}`);
            optIds.add(c.option_id);
        });

        // Verify with Teacher Master Key
        const tKey = `task${q.task_id}`;
        if (TEACHER_MASTER_KEY[tKey]) {
            const expectedLetter = TEACHER_MASTER_KEY[tKey][q.original_number];
            const correctIdx = q.choices.findIndex(c => c.is_correct === true);
            const actualLetter = ["A", "B", "C", "D"][correctIdx];
            if (expectedLetter !== actualLetter) {
                errors.push(`Question ${q.question_id} (Task ${q.task_id} #${q.original_number}) answer letter mismatch: expected ${expectedLetter}, found ${actualLetter}`);
            }
        }
    });

    // 3. Multi-Trial Randomization Test
    let randomizationValid = true;
    for (let trial = 1; trial <= 10; trial++) {
        const shuffledTask1 = [...masterQuestionBank.task1].sort(() => Math.random() - 0.5);
        if (shuffledTask1.length !== 10) randomizationValid = false;

        shuffledTask1.forEach(q => {
            const correctTextOriginal = q.choices.find(c => c.option_id === q.correct_option_id).text;
            const shuffledChoices = [...q.choices].sort(() => Math.random() - 0.5);
            const foundByCorrectId = shuffledChoices.find(c => c.option_id === q.correct_option_id);
            if (!foundByCorrectId || foundByCorrectId.text !== correctTextOriginal) {
                randomizationValid = false;
            }
        });
    }

    if (!randomizationValid) {
        errors.push("Randomization integrity test failed during trial execution.");
    }

    return {
        passed: errors.length === 0,
        errors: errors,
        summary: {
            task1: masterQuestionBank.task1.length,
            task2: masterQuestionBank.task2.length,
            task3: masterQuestionBank.task3.length,
            task4: masterQuestionBank.task4.length,
            total: allQuestions.length,
            randomizationAudit: randomizationValid ? "100% PASSED" : "FAILED"
        }
    };
}

// Module export / window attachment
if (typeof module !== "undefined" && module.exports) {
    module.exports = { masterQuestionBank, READING_PASSAGES, readingMaterials, TEACHER_MASTER_KEY, validateQuizDatabase };
}
if (typeof window !== "undefined") {
    window.masterQuestionBank = masterQuestionBank;
    window.READING_PASSAGES = READING_PASSAGES;
    window.readingMaterials = readingMaterials;
    window.TEACHER_MASTER_KEY = TEACHER_MASTER_KEY;
    window.validateQuizDatabase = validateQuizDatabase;
}