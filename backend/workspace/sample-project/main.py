"""Sample Project — main entry point."""

from utils.helpers import greet, fibonacci


def main():
    print(greet("Developer"))
    print(f"First 10 Fibonacci numbers: {fibonacci(10)}")


if __name__ == "__main__":
    main()
