# Project Template Research for MCP Prompts

## Common GTD Project Templates

### 1. Client Project Template
```
Client: [Client Name]
Project: [Project Name]
Due: [Delivery Date]

Planning Phase (sequential):
- Initial client meeting @meeting
- Document requirements @computer
- Create project proposal @computer
- Get proposal approved @waiting
- Sign contract @admin

Execution Phase (parallel):
- Set up project workspace @computer
- Create deliverables @computer  
- Schedule check-in meetings @admin
- Track time and expenses @admin

Review Phase (sequential):
- Internal quality review @review
- Client review session @meeting
- Incorporate feedback @computer
- Final delivery @computer

Closure (sequential):
- Send invoice @admin
- Get payment confirmation @waiting
- Archive project files @computer
- Request testimonial @email
- Schedule follow-up (defer: +30 days) @someday
```

### 2. Product Launch Template
```
Product: [Product Name]
Launch Date: [Target Date]

Research & Planning (sequential):
- Market research @research
- Competitive analysis @research
- Define target audience @planning
- Set pricing strategy @planning

Development (parallel):
- Build MVP @development
- Create marketing materials @marketing
- Set up sales funnel @sales
- Prepare support documentation @documentation

Pre-Launch (sequential):
- Beta testing (due: -14 days) @testing
- Gather feedback @review
- Final bug fixes @development
- Prepare launch assets @marketing

Launch Day (sequential):
- Publish product @launch
- Send announcement emails @marketing
- Post on social media @marketing
- Monitor initial responses @monitoring

Post-Launch (parallel):
- Track metrics daily (repeat: daily for 7 days) @review
- Respond to customer feedback @support
- Plan iteration 2 @planning
- Schedule retrospective (defer: +7 days) @meeting
```

### 3. Event Planning Template
```
Event: [Event Name]
Date: [Event Date]

Initial Planning (sequential):
- Define event goals @planning
- Set budget @finance
- Create guest list @admin
- Choose date and time @planning

Venue & Logistics (parallel):
- Research venues @research
- Book venue @booking
- Arrange catering @vendor
- Organize AV equipment @vendor
- Plan parking/transport @logistics

Marketing (sequential):
- Design invitations @design
- Send save-the-dates (due: -60 days) @communication
- Send formal invitations (due: -30 days) @communication
- Track RSVPs @admin
- Send reminders (due: -7 days) @communication

Day Before (sequential):
- Final headcount to caterer @vendor
- Prepare materials @preparation
- Brief team @meeting
- Set up venue @onsite

Event Day (sequential):
- Arrive early for setup @onsite
- Welcome guests @onsite
- Manage event flow @onsite
- Thank attendees @onsite

Follow-up (parallel):
- Send thank you notes (defer: +1 day) @communication
- Process feedback survey @review
- Pay vendors @finance
- Archive photos/videos @admin
- Plan next event @someday
```

### 4. Home Improvement Project Template
```
Project: [Room/Area]
Budget: [Amount]
Deadline: [Completion Date]

Planning (sequential):
- Measure space @home
- Create design/mood board @planning
- Set budget breakdown @finance
- Get family approval @communication

Research (parallel):
- Research contractors @research
- Get three quotes @phone
- Check references @phone
- Compare materials/costs @research

Preparation (sequential):
- Select contractor @decision
- Sign contract @admin
- Order materials @purchase
- Schedule start date @planning
- Prepare space @home

Execution (sequential):
- Day 1: Demo/prep @home
- Day 2-X: Main work @home
- Daily: Progress check @home
- Address issues promptly @communication

Completion (sequential):
- Final walkthrough @review
- Create punch list @review
- Complete punch items @waiting
- Final payment @finance
- Leave review @online
```

### 5. Learning/Course Template
```
Course: [Course Name]
Goal: [Learning Objective]
Deadline: [Target Completion]

Setup (sequential):
- Register for course @online
- Buy materials/books @purchase
- Set up study space @home
- Block calendar time @planning

Weekly Study (repeat: weekly):
- Review week's materials @study
- Complete exercises @practice
- Take notes @study
- Join discussion/forum @online
- Practice problems (30 min daily) @practice

Milestones (sequential):
- Week 2: First quiz @assessment
- Week 4: Midterm project @project
- Week 6: Group work @collaboration
- Week 8: Final exam @assessment

Application (parallel):
- Create practice project @project
- Share learnings (blog/social) @writing
- Apply to current work @work
- Build portfolio piece @creative

Follow-up:
- Get certificate @admin
- Update resume/LinkedIn @career
- Plan next course @learning
- Join alumni group @networking
```

### 6. Travel Planning Template
```
Trip: [Destination]
Dates: [Start - End]
Travelers: [Number/Names]

Research Phase (parallel):
- Research destination @research
- Check passport expiry @admin
- Review visa requirements @admin
- Check vaccination needs @health
- Research weather/packing @research

Booking Phase (sequential):
- Compare flights @online
- Book flights @purchase
- Book accommodation @purchase
- Arrange transport @booking
- Purchase travel insurance @purchase

Pre-Departure (sequential):
- Create itinerary @planning
- Book activities/tours (due: -14 days) @booking
- Arrange pet/house care (due: -7 days) @home
- Pack luggage (due: -2 days) @home
- Check-in online (due: -1 day) @online

During Trip:
- Daily: Check next day plans @review
- Track expenses @finance
- Backup photos @tech
- Send updates home @communication

Post-Trip (parallel):
- Unpack and laundry @home
- Process photos @creative
- Submit expense reports @finance
- Write reviews @online
- Plan next trip @someday
```

## Template Patterns for MCP Implementation

### Common Elements Across Templates:
1. **Phases**: Most projects have distinct phases (planning, execution, review)
2. **Task Types**: Sequential vs parallel based on dependencies
3. **Contexts**: @tags for GTD contexts (computer, phone, home, etc.)
4. **Timing**: Due dates, defer dates, and repeating tasks
5. **Waiting**: Tasks dependent on others marked @waiting
6. **Reviews**: Built-in review points throughout

### Variables to Parameterize:
- Names (client, project, product)
- Dates (deadlines, milestones)
- Quantities (budget, team size)
- Durations (project length, review cycles)
- Contexts (can be customized per user)

### MCP Prompt Implementation Ideas:
1. **Interactive Setup**: Prompt asks for key variables
2. **Template Selection**: User chooses from template library
3. **Smart Defaults**: Reasonable defaults for timing/contexts
4. **Batch Creation**: Create entire project structure at once
5. **Customization**: Allow on-the-fly modifications

These templates provide a solid foundation for implementing project template prompts in the OmniFocus MCP server.