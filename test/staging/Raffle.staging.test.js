const { assert, expect } = require("chai")
const { getNamedAccounts, ethers, network } = require("hardhat")
const { developmentChains } = require("../../helper-hardhat-config")
//写完staging test,要在测试网进行测试
//1. get SubId for chainlink VRF
//2. deploy our contract using SubId
//3. regidter the contract with chainlink VRF & subId
//4. register the contract with chainlink keepers
//5. run staging test
developmentChains.includes(network.name)
    ? describe.skip
    : describe("Raffle Staging Tests", function () {
          let raffle, raffleEntranceFee, deployer

          beforeEach(async function () {
              deployer = (await getNamedAccounts()).deployer
              raffle = await ethers.getContract("Raffle", deployer)
              raffleEntranceFee = await raffle.getEntranceFee()
          })

          describe("fulfillRandomWords", function () {
              it("works with live Chainlink Keepers and Chainlink VRF, we get a random winner", async function () {
                  // enter the raffle,除此之外不做任何事
                  //因为chianilink VRF 和 chainlink keeper是kick函数的人

                  const accounts = await ethers.getSigners()

                  console.log("Setting up test...")
                  const startingTimeStamp = await raffle.getLastTimeStamp()

                  console.log("Setting up Listener...")

                  await new Promise(async (resolve, reject) => {
                      // setup listener before we enter the raffle
                      // Just in case the blockchain moves REALLY fast
                      //下面就是setup a listener
                      raffle.once("WinnerPicked", async () => {
                          console.log("WinnerPicked event fired!")
                          try {
                              //add assert
                              const recentWinner =
                                  await raffle.getRecentWinner()
                              const rafflestate = await raffle.getRaffleState()
                              const winnerendingBalance =
                                  await accounts[0].getBalance()
                              const endingTime = await raffle.getLastTimeStamp()

                              assert.equal(
                                  recentWinner.toString(),
                                  accounts[0].address
                              )
                              assert.equal(rafflestate, 0)
                              assert.equal(
                                  winnerendingBalance.toString(),
                                  winnerstartingBalance
                                      .add(raffleEntranceFee)
                                      .toString()
                              )
                              assert(endingTime > startingTimeStamp)
                              resolve()
                          } catch (error) {
                              console.log(error)
                              reject(error)
                          }
                      })
                      // Then entering the raffle
                      console.log("Entering Raffle...")
                      //只有我们的deployer进入raffle游戏
                      const tx = await raffle.enterRaffle({
                          value: raffleEntranceFee,
                      })
                      await tx.wait(1)
                      const winnerstartingBalance =
                          await accounts[0].getBalance()

                      // and this code WONT complete until our listener has finished listening!
                  })
              })
          })
      })
