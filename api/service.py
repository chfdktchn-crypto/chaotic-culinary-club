from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import anthropic
import os
import re

client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

app = FastAPI(title="Chef-AI API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
    max_age=3600,
)


class RecipeRequest(BaseModel):
    ingredients: list[str]
    cuisine: str | None = None
    max_time: int | None = 30
    servings: int = 2


class FindRequest(BaseModel):
    dish: str
    cuisine: str | None = None
    servings: int = 2


def parse_recipe(text):
    title = ""
    ingredients = []
    steps = []

    title_match = re.search(r"title:\s*(.+?)(?=\n|ingredients:)", text, re.IGNORECASE)
    if title_match:
        title = title_match.group(1).strip()

    ing_match = re.search(r"ingredients:\s*\n(.*?)(?=\nmethod:|\ndirections:|\nsteps:)", text, re.IGNORECASE | re.DOTALL)
    if ing_match:
        raw = ing_match.group(1).strip()
        lines = [re.sub(r"^[-•*]\s*", "", line).strip() for line in raw.split("\n") if line.strip()]
        ingredients = [re.sub(r"\s+\d+$", "", line) for line in lines]

    steps_match = re.search(r"(?:method|directions|steps):\s*\n(.*?)$", text, re.IGNORECASE | re.DOTALL)
    if steps_match:
        raw = steps_match.group(1).strip()
        step_list = re.split(r"\n\d+\.\s+|\n", raw)
        steps = [re.sub(r"^\d+\.\s*", "", s).strip() for s in step_list if len(s.strip()) > 10]
        steps = [s for s in steps if not re.match(r"^directions\s*\d*\.?$", s, re.IGNORECASE)]

    if not title:
        title = "Your Recipe"
    if not ingredients and not steps:
        steps = [text]

    return {"title": title, "ingredients": ingredients, "steps": steps}


def build_prompt(intro, cuisine, servings):
    return f"""{intro}
{"Cuisine style: " + cuisine + "." if cuisine else ""}
Servings: {servings}.

Rules:
- Use proper units (teaspoon, tablespoon, cup, pound, etc.)
- Use plurals correctly (1 egg, 2 eggs, 1 dash, 2 dashes)
- Write time ranges with a hyphen (8-10 minutes, not 8 10 minutes)
- Do NOT include the words "cook time", "preparation time", or "directions" anywhere
- Each method step should be one clear action only
- Do not add any text before or after the recipe

Format your response exactly like this:
Title: [recipe name]

Ingredients:
- [quantity] [ingredient]
- [quantity] [ingredient]

Method:
1. [step]
2. [step]
"""


@app.post("/generate")
async def generate(req: RecipeRequest):
    if not req.ingredients:
        raise HTTPException(status_code=422, detail="At least one ingredient is required.")

    intro = f"You are a professional recipe writer. Generate a clear, accurate recipe using these ingredients: {', '.join(req.ingredients)}."
    if req.max_time:
        intro += f" Maximum cooking time: {req.max_time} minutes."

    prompt = build_prompt(intro, req.cuisine, req.servings)

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )

    text = message.content[0].text
    parsed = parse_recipe(text)
    parsed["base_servings"] = req.servings
    return {**parsed, "model": "claude-sonnet-4"}


@app.post("/find")
async def find(req: FindRequest):
    if not req.dish.strip():
        raise HTTPException(status_code=422, detail="Please enter a dish name.")

    intro = f"You are a professional recipe writer. Generate a complete, authentic recipe for: {req.dish}."

    prompt = build_prompt(intro, req.cuisine, req.servings)

    message = client.messages.create(
        model="claude-sonnet-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}]
    )

    text = message.content[0].text
    parsed = parse_recipe(text)
    parsed["base_servings"] = req.servings
    return {**parsed, "model": "claude-sonnet-4"}


@app.get("/")
async def root():
    return {"status": "Chef-AI API ready", "model": "claude-sonnet-4"}
